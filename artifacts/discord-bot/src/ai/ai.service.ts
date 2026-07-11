import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  type Client,
  type Message,
  type GuildTextBasedChannel,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import type { ConversationMessage, ToolCall, ToolResult } from './types';
import { ResponseDeliveryService } from '../discord/response-delivery.service';
import { ControlCenterService } from '../discord/control-center';
import { runStartupAudit, runCCRenderAudit } from '../discord/control-center/cc-test';
import { ticketSystem } from '../community/tickets';
import { verificationService } from '../discord/verification/verification.service';
import { applicationService } from '../discord/applications/application.service';
import { PermissionManager } from './permission-manager';
import { ToolRegistry } from './tool-registry';
import { PromptBuilder } from './prompt-builder';
import { Planner } from './planner';
import { Executor } from './executor';
import { ExecutionLogger } from './execution-logger';
import { MemoryManager } from './memory/MemoryManager';
import { WorkspaceMemory } from './memory/WorkspaceMemory';
import { Verifier } from './verifier';
import { VoiceManager } from '../voice/VoiceManager';
import { VoiceDiagnostics } from '../voice/VoiceDiagnostics';
import type { VoicePersonality } from '../voice/VoiceConversation';
import type { VoiceModuleConfig } from '../config/config';
import { logger } from '../utils/logger';

export interface AIConfig {
  serverName: string;
  adminRole: string;
  logChannelId: string | undefined;
  chatChannelId: string | undefined;
  enablePlanPreview: boolean;
  enableReflection: boolean;
  voice?: VoiceModuleConfig;
}

type ButtonCallback = () => Promise<void>;

interface PendingButton {
  userId: string;
  callback: ButtonCallback;
  executing: boolean;
}

export class AIService {
  private readonly permissionManager: PermissionManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly promptBuilder: PromptBuilder;
  private readonly planner: Planner;
  private readonly executor: Executor;
  private readonly executionLogger: ExecutionLogger;
  private readonly memoryManager: MemoryManager;
  private readonly workspaceMemory: WorkspaceMemory;
  private readonly verifier: Verifier;
  private readonly pendingButtons = new Map<string, PendingButton>();
  private readonly controlCenter: ControlCenterService;
  private voiceManager: VoiceManager | null = null;

  constructor(private readonly config: AIConfig) {
    this.permissionManager = new PermissionManager(config.adminRole);
    this.toolRegistry = new ToolRegistry();
    this.promptBuilder = new PromptBuilder(config.serverName);
    this.planner = new Planner(this.toolRegistry);
    this.executor = new Executor(this.toolRegistry);
    this.executionLogger = new ExecutionLogger(config.logChannelId);
    this.memoryManager = new MemoryManager();
    this.workspaceMemory = new WorkspaceMemory();
    this.verifier = new Verifier();
    this.controlCenter = new ControlCenterService(this.toolRegistry, this.permissionManager);
  }

  async initialize(): Promise<void> {
    await this.memoryManager.initialize();
    await this.workspaceMemory.initialize();
    logger.info(`AI model: ${this.planner.modelName}`);
    runStartupAudit();

    // ── Voice AI ──────────────────────────────────────────────────────────
    if (this.config.voice) {
      const { voice } = this.config;
      VoiceDiagnostics.run(voice.sttProvider, voice.ttsProvider);
      this.voiceManager = new VoiceManager({
        ai: {
          memoryManager: this.memoryManager,
          planner: this.planner,
          toolRegistry: this.toolRegistry,
          executor: this.executor,
          promptBuilder: this.promptBuilder,
        },
        sttProvider: voice.sttProvider,
        ttsProvider: voice.ttsProvider,
        personality: voice.personality,
        adminRoleIdentifier: this.config.adminRole,
        confirmChannelId: voice.confirmChannelId,
        pendingButtons: this.pendingButtons,
      });
      logger.success('Voice AI ready — say "Hey Mufasa" after joining a voice channel');
    }
  }

  start(client: Client): void {
    ticketSystem.init(client).catch(err => logger.error('[TICKETS] Ticket System Pro failed to initialize', err));

    client.on('messageCreate', message => {
      this.onMessage(message, client).catch(error => {
        logger.error('AI message handler error', error);
      });
    });

    client.on('interactionCreate', interaction => {
      if (interaction.isChatInputCommand()) {
        const name = interaction.commandName;
        if (name === 'ai') {
          this.onAICommand(interaction as ChatInputCommandInteraction, client).catch(err =>
            logger.error('AI slash command error', err),
          );
          return;
        }
        if (name === 'forget') {
          this.onForgetCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('Forget command error', err),
          );
          return;
        }
        if (name === 'memory') {
          this.onMemoryCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('Memory command error', err),
          );
          return;
        }
        if (name === 'preferences') {
          this.onPreferencesCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('Preferences command error', err),
          );
          return;
        }
        if (name === 'resetpreferences') {
          this.onResetPrefsCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('Reset prefs command error', err),
          );
          return;
        }
        if (name === 'workspace') {
          this.onWorkspaceCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('Workspace command error', err),
          );
          return;
        }
        if (name === 'voice') {
          this.onVoiceCommand(interaction as ChatInputCommandInteraction, client).catch(err =>
            logger.error('Voice command error', err),
          );
          return;
        }
        if (name === 'panel') {
          this.controlCenter.handlePanelCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('Control Center panel error', err),
          );
          return;
        }
        if (name === 'cc-test') {
          this.onCCTestCommand(interaction as ChatInputCommandInteraction).catch(err =>
            logger.error('CC test command error', err),
          );
          return;
        }
      }

      // ── Control Center interactions (cc:* custom IDs) ──────────────────────
      const isCC = (id: string) => id.startsWith('cc:');
      if (
        (interaction.isButton() && isCC(interaction.customId)) ||
        (interaction.isStringSelectMenu() && isCC(interaction.customId)) ||
        (interaction.isModalSubmit() && isCC(interaction.customId))
      ) {
        if (interaction.guild) {
          this.controlCenter.handleInteraction(interaction, interaction.guild).catch(err =>
            logger.error('Control Center interaction error', err),
          );
        }
        return;
      }

      // ── Ticket system interactions (tk:* custom IDs) ───────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('tk:')) {
        if (interaction.guild) {
          ticketSystem.handleInteraction(interaction, interaction.guild).catch(err =>
            logger.error('Ticket interaction error', err),
          );
        }
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('tk:modal:')) {
        if (interaction.guild) {
          ticketSystem.handleModal(interaction, interaction.guild).catch(err =>
            logger.error('Ticket modal error', err),
          );
        }
        return;
      }
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tk:select:')) {
        if (interaction.guild) {
          ticketSystem.handleSelectMenu(interaction, interaction.guild).catch(err =>
            logger.error('Ticket select menu error', err),
          );
        }
        return;
      }

      // ── Verification system interactions (vf:* custom IDs) ─────────────────
      if (interaction.isButton() && interaction.customId.startsWith('vf:')) {
        if (interaction.guild) {
          verificationService.handleInteraction(interaction, interaction.guild).catch(err =>
            logger.error('Verification interaction error', err),
          );
        }
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('vf:m:')) {
        if (interaction.guild) {
          verificationService.handleModal(interaction, interaction.guild).catch(err =>
            logger.error('Verification modal error', err),
          );
        }
        return;
      }

      // ── Application system interactions (ap:* custom IDs) ──────────────────
      if (interaction.isButton() && interaction.customId.startsWith('ap:')) {
        if (interaction.guild) {
          applicationService.handleInteraction(interaction, interaction.guild).catch(err =>
            logger.error('Application interaction error', err),
          );
        }
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('ap:m:')) {
        if (interaction.guild) {
          applicationService.handleModal(interaction, interaction.guild).catch(err =>
            logger.error('Application modal error', err),
          );
        }
        return;
      }

      // Handle pending button clicks — bound to the initiating user only
      if (interaction.isButton()) {
        const entry = this.pendingButtons.get(interaction.customId);
        if (entry) {
          if (entry.userId !== interaction.user.id) {
            interaction.reply({ content: '❌ This confirmation was not initiated by you.', ephemeral: true }).catch(() => {});
            return;
          }
          if (entry.executing) return; // Idempotency guard — prevent double execution
          entry.executing = true;
          interaction.deferUpdate().then(entry.callback).catch(err => logger.error('Button handler error', err));
        }
      }
    });

    logger.success('AI Control Center is active');
    if (this.config.adminRole) logger.info(`AI admin role: "${this.config.adminRole}"`);
    if (this.config.chatChannelId) logger.info(`AI chat channel: ${this.config.chatChannelId}`);
    if (!this.config.logChannelId) logger.warning('CHANNEL_AI_LOG not set — execution logs will not be posted');
    logger.info(`Plan preview: ${this.config.enablePlanPreview ? 'enabled' : 'disabled'}`);
    logger.info(`Reflection: ${this.config.enableReflection ? 'enabled' : 'disabled'}`);
  }

  // ── Slash Commands ────────────────────────────────────────────────────────

  private async onAICommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }

    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);

    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission to use the AI Control Center.', ephemeral: true });
      return;
    }

    const content = interaction.options.getString('prompt', true).trim();
    if (!content) {
      await interaction.reply({ content: '❌ Please provide a prompt.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const startTime = Date.now();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    logger.info(`/ai from ${interaction.user.tag}: "${content}"`);

    try {
      const userMsg: ConversationMessage = { role: 'user', content };
      this.memoryManager.addUserMessage(userId, guildId, content);
      this.syncToWorkspace(userId, guildId, userMsg);

      const plan = await this.planner.plan(this.buildMessages(userId, guildId));

      if (plan.kind === 'text') {
        const assistantMsg: ConversationMessage = { role: 'assistant', content: plan.content };
        this.memoryManager.addAssistantMessage(userId, guildId, assistantMsg);
        this.syncToWorkspace(userId, guildId, assistantMsg);
        await ResponseDeliveryService.send(interaction, plan.content);
        return;
      }

      // Plan preview
      if (this.config.enablePlanPreview) {
        const confirmed = await this.showSlashPlanPreview(interaction, plan.toolCalls, userId);
        if (!confirmed) return;
      }

      const { responseText } = await this.runPipeline(
        userId, guildId, plan.toolCalls, interaction.guild, client,
        interaction.user.id, interaction.user.tag, content, startTime,
      );

      await ResponseDeliveryService.send(interaction, responseText);

    } catch (error) {
      logger.error('AI slash command execution error', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await interaction.editReply({ content: `❌ An error occurred: ${errMsg}` }).catch(() => {});
    }
  }

  private async onCCTestCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command only works inside a server.', flags: 64 });
      return;
    }
    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission to run diagnostics.', flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    const report = runCCRenderAudit();
    const allPassed = report.failed === 0;

    const embed = new EmbedBuilder()
      .setColor(allPassed ? 0x57f287 : 0xed4245)
      .setTitle(`${allPassed ? '✅' : '❌'} CC Render Audit — ${report.passed}/${report.passed + report.failed} passed`)
      .setDescription(
        `Ran **${report.passed + report.failed}** renderer tests in **${report.totalMs}ms**.\n` +
        `All payloads were checked for duplicate custom IDs and Discord limit violations.\n` +
        (allPassed ? '\n✅ No issues found.' : `\n❌ **${report.failed} test(s) failed** — see bot logs for details.`),
      );

    const lines = report.results.map(r => {
      const icon = r.passed ? '✅' : '❌';
      const idSummary = r.passed ? `${r.ids.length} IDs` : `ERROR`;
      return `${icon} \`${r.renderer}\` — ${idSummary}`;
    });

    // Discord embed fields have a 1024 char limit per field; split into two if needed
    const half = Math.ceil(lines.length / 2);
    embed.addFields(
      { name: 'Renderers (1)', value: lines.slice(0, half).join('\n'), inline: true },
      { name: 'Renderers (2)', value: lines.slice(half).join('\n'), inline: true },
    );

    if (!allPassed) {
      const failures = report.results
        .filter(r => !r.passed)
        .map(r => `**${r.renderer}**\n\`${r.errorMsg}\``)
        .join('\n\n');
      embed.addFields({ name: '❌ Failures', value: failures.slice(0, 1024), inline: false });
    }

    embed.setFooter({ text: `Full ID listings are in the bot logs — search [CC][assert]` });

    await interaction.editReply({ embeds: [embed] });
  }

  private async onForgetCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }
    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
      return;
    }
    this.memoryManager.clearSession(interaction.user.id, interaction.guild.id);
    await interaction.reply({ content: '🧹 AI conversation memory cleared. Starting fresh!', ephemeral: true });
  }

  private async onMemoryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }
    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
      return;
    }

    const display = this.memoryManager.getDisplay(interaction.user.id, interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🧠 AI Memory')
      .addFields(
        { name: 'Messages in context', value: String(display.messageCount), inline: true },
        { name: 'Current task', value: display.task ?? 'None', inline: true },
        { name: 'Active objects', value: display.objects.length > 0 ? display.objects.map(o => `${o.type}: ${o.name}`).join(', ') : 'None', inline: false },
        { name: 'Context', value: [
          display.context.category ? `📁 Category: ${display.context.category.name}` : null,
          display.context.channel ? `💬 Channel: ${display.context.channel.name}` : null,
          display.context.role ? `🎭 Role: ${display.context.role.name}` : null,
        ].filter(Boolean).join('\n') || 'No active context', inline: false },
      )
      .setTimestamp(new Date(display.lastActivity));

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  private async onPreferencesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }
    const prefs = this.memoryManager.getLongTermMemory().get(interaction.user.id);
    if (!prefs) {
      await interaction.reply({ content: '📝 No preferences saved yet. The AI will learn your preferences as you work.', ephemeral: true });
      return;
    }
    const lines = Object.entries(prefs)
      .filter(([k]) => k !== 'updatedAt')
      .map(([k, v]) => `**${k}:** ${String(v)}`);
    await interaction.reply({ content: `📝 **Your Preferences**\n${lines.join('\n') || 'None saved yet.'}`, ephemeral: true });
  }

  private async onResetPrefsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }
    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
      return;
    }
    this.memoryManager.getLongTermMemory().reset(interaction.user.id);
    await interaction.reply({ content: '🗑️ Long-term preferences have been reset.', ephemeral: true });
  }

  private async onWorkspaceCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }
    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand(false);
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (sub === 'start') {
      const name = interaction.options.getString('name', true).trim();
      const description = interaction.options.getString('description', false) ?? undefined;
      const existing = this.workspaceMemory.findByName(userId, guildId, name);
      if (existing) {
        await interaction.reply({ content: `⚠️ A workspace named **"${name}"** already exists. Use \`/workspace resume\` to continue it.`, ephemeral: true });
        return;
      }
      const ws = this.workspaceMemory.create(name, userId, guildId, description);
      this.memoryManager.setWorkspace(userId, guildId, ws.id);
      await interaction.reply({ content: `✅ Started workspace **"${name}"**${description ? ` — ${description}` : ''}. All AI commands will now be saved to this workspace.`, ephemeral: true });

    } else if (sub === 'resume') {
      const name = interaction.options.getString('name', true).trim();
      const ws = this.workspaceMemory.findByName(userId, guildId, name);
      if (!ws) {
        await interaction.reply({ content: `❌ Workspace **"${name}"** not found. Use \`/workspace list\` to see available workspaces.`, ephemeral: true });
        return;
      }
      // Clear session and restore full workspace state (messages + structured state)
      this.memoryManager.clearSession(userId, guildId);
      const msgs = this.workspaceMemory.getMessages(ws.id);
      for (const msg of msgs.slice(-30)) {
        this.memoryManager.addRawMessage(userId, guildId, msg);
      }
      this.memoryManager.restoreWorkspaceSession(userId, guildId, ws);
      this.memoryManager.setWorkspace(userId, guildId, ws.id);
      await interaction.reply({ content: `▶️ Resumed workspace **"${name}"** — ${ws.objects.length} object(s), ${msgs.length} message(s) in history.`, ephemeral: true });

    } else if (sub === 'end') {
      const wsId = this.memoryManager.getWorkspaceId(userId, guildId);
      if (!wsId) {
        await interaction.reply({ content: '❌ No active workspace.', ephemeral: true });
        return;
      }
      const ws = this.workspaceMemory.get(wsId);
      this.memoryManager.setWorkspace(userId, guildId, undefined);
      await interaction.reply({ content: `⏹️ Ended workspace **"${ws?.name ?? wsId}"**. Conversation will no longer be saved to it.`, ephemeral: true });

    } else if (sub === 'list') {
      const workspaces = this.workspaceMemory.listForUser(userId, guildId);
      if (workspaces.length === 0) {
        await interaction.reply({ content: '📂 No workspaces found. Use `/workspace start <name>` to create one.', ephemeral: true });
        return;
      }
      const currentId = this.memoryManager.getWorkspaceId(userId, guildId);
      const lines = workspaces.map(ws =>
        `${ws.id === currentId ? '▶️' : '📂'} **${ws.name}** — ${ws.objects.length} obj, last active <t:${Math.floor(ws.lastActivity / 1000)}:R>`,
      );
      await interaction.reply({ content: `**Your Workspaces**\n${lines.join('\n')}`, ephemeral: true });

    } else if (sub === 'delete') {
      const name = interaction.options.getString('name', true).trim();
      const ws = this.workspaceMemory.findByName(userId, guildId, name);
      if (!ws) {
        await interaction.reply({ content: `❌ Workspace **"${name}"** not found.`, ephemeral: true });
        return;
      }
      this.workspaceMemory.delete(ws.id);
      if (this.memoryManager.getWorkspaceId(userId, guildId) === ws.id) {
        this.memoryManager.setWorkspace(userId, guildId, undefined);
      }
      await interaction.reply({ content: `🗑️ Deleted workspace **"${name}"**.`, ephemeral: true });

    } else {
      await interaction.reply({ content: 'Use `/workspace start`, `/workspace resume`, `/workspace end`, `/workspace list`, or `/workspace delete`.', ephemeral: true });
    }
  }

  // ── Voice Command Handler ─────────────────────────────────────────────────

  private async onVoiceCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', flags: [4096] });
      return;
    }

    // Defer immediately — member fetch + voice join can exceed the 3-second window
    await interaction.deferReply({ flags: [64] }); // 64 = Ephemeral

    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);

    if (!this.permissionManager.isAdmin(member)) {
      await interaction.editReply({ content: '❌ You do not have permission to use Voice AI.' });
      return;
    }

    if (!this.voiceManager) {
      await interaction.editReply({ content: '❌ Voice AI is not enabled. Set `STT_PROVIDER` and `TTS_PROVIDER` environment variables to activate it.' });
      return;
    }

    const sub = interaction.options.getSubcommand(false);

    if (sub === 'join') {
      const voiceChannel = VoiceManager.getMemberVoiceChannel(member);
      if (!voiceChannel) {
        await interaction.editReply({ content: '❌ You need to be in a voice channel first.' });
        return;
      }
      const result = await this.voiceManager.join(interaction.guild, voiceChannel, member, client);
      await interaction.editReply({ content: result.message });

    } else if (sub === 'leave') {
      const result = this.voiceManager.leave(interaction.guild);
      await interaction.editReply({ content: result.message });

    } else if (sub === 'status') {
      const status = this.voiceManager.getStatus(interaction.guild.id);
      await interaction.editReply({ content: status });

    } else if (sub === 'personality') {
      const type = interaction.options.getString('type', true) as VoicePersonality;
      const result = this.voiceManager.setPersonality(interaction.guild, type);
      await interaction.editReply({ content: result.message });

    } else {
      await interaction.editReply({ content: 'Use `/voice join`, `/voice leave`, `/voice status`, or `/voice personality`.' });
    }
  }

  // ── Message Handler ───────────────────────────────────────────────────────

  private async onMessage(message: Message, client: Client): Promise<void> {
    if (message.author.bot || !message.guild) return;

    const botUser = client.user;
    if (!botUser) return;

    const inAiChannel = this.config.chatChannelId ? message.channelId === this.config.chatChannelId : false;
    const mentionsBot = message.mentions.has(botUser.id);
    if (!inAiChannel && !mentionsBot) return;

    const member = message.member ?? await message.guild.members.fetch(message.author.id);
    if (!this.permissionManager.isAdmin(member)) return;

    const content = message.content
      .replace(`<@${botUser.id}>`, '')
      .replace(`<@!${botUser.id}>`, '')
      .trim();
    if (!content) return;

    const startTime = Date.now();
    const userId = message.author.id;
    const guildId = message.guild.id;
    logger.info(`AI @mention from ${message.author.tag}: "${content}"`);

    // Show typing while processing
    let typingInterval: ReturnType<typeof setInterval> | null = null;
    const stopTyping = (): void => {
      if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    };

    if (message.channel.isTextBased()) {
      await (message.channel as GuildTextBasedChannel).sendTyping().catch(() => {});
      typingInterval = setInterval(() => {
        (message.channel as GuildTextBasedChannel).sendTyping().catch(() => {});
      }, 8_000);
    }

    try {
      const userMsg: ConversationMessage = { role: 'user', content };
      this.memoryManager.addUserMessage(userId, guildId, content);
      this.syncToWorkspace(userId, guildId, userMsg);

      const plan = await this.planner.plan(this.buildMessages(userId, guildId));

      if (plan.kind === 'text') {
        stopTyping();
        const assistantMsg: ConversationMessage = { role: 'assistant', content: plan.content };
        this.memoryManager.addAssistantMessage(userId, guildId, assistantMsg);
        this.syncToWorkspace(userId, guildId, assistantMsg);
        await ResponseDeliveryService.send(message, plan.content);
        return;
      }

      if (this.config.enablePlanPreview) {
        stopTyping();
        await this.showMessagePlanPreview(
          message,
          plan.toolCalls,
          userId,
          async confirmedToolCalls => {
            const { responseText } = await this.runPipeline(
              userId, guildId, confirmedToolCalls, message.guild!,
              client, userId, member.user.tag, content, startTime,
            );
            await ResponseDeliveryService.send(message, responseText).catch(err =>
              logger.error('Failed to send AI response', err),
            );
          },
        );
        return;
      }

      stopTyping();
      const { responseText } = await this.runPipeline(
        userId, guildId, plan.toolCalls, message.guild, client,
        userId, member.user.tag, content, startTime,
      );
      await ResponseDeliveryService.send(message, responseText).catch(err =>
        logger.error('Failed to send AI response', err),
      );

    } catch (error) {
      stopTyping();
      logger.error('AI execution error', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await message.reply(`❌ An error occurred: ${errMsg}`).catch(() => {});
    }
  }

  // ── Core Pipeline ─────────────────────────────────────────────────────────

  private async runPipeline(
    userId: string,
    guildId: string,
    toolCalls: ToolCall[],
    guild: Guild,
    client: Client,
    executorId: string,
    executorTag: string,
    prompt: string,
    startTime: number,
  ): Promise<{ responseText: string; results: ToolResult[] }> {
    // Execute
    const results = await this.executor.execute(toolCalls, guild);

    // Verify
    await this.verifier.verify(toolCalls, results, guild);

    // Update memory with tool results — single combined assistant message for all tool calls
    const assistantCallMsg: ConversationMessage = { role: 'assistant', content: null, tool_calls: toolCalls };
    this.memoryManager.addAssistantMessage(userId, guildId, assistantCallMsg);
    this.syncToWorkspace(userId, guildId, assistantCallMsg);

    for (const result of results) {
      const resultContent = JSON.stringify({ success: result.success, message: result.message });
      this.memoryManager.addToolResult(userId, guildId, result.toolCallId, resultContent);
      this.syncToWorkspace(userId, guildId, { role: 'tool', tool_call_id: result.toolCallId, content: resultContent });
    }
    this.memoryManager.processToolResults(userId, guildId, toolCalls, results);

    // Get final AI summary
    const finalPlan = await this.planner.plan(this.buildMessages(userId, guildId));
    let responseText: string;
    if (finalPlan.kind === 'text') {
      responseText = finalPlan.content;
      const summaryMsg: ConversationMessage = { role: 'assistant', content: responseText };
      this.memoryManager.addAssistantMessage(userId, guildId, summaryMsg);
      this.syncToWorkspace(userId, guildId, summaryMsg);
    } else {
      responseText = results.map(r => `${r.success ? '✅' : '❌'} ${r.message}`).join('\n');
    }

    // Optional reflection
    if (this.config.enableReflection && results.some(r => r.success)) {
      const suggestion = await this.generateReflection(userId, guildId, results);
      if (suggestion) responseText += `\n\n💡 **Suggestion:** ${suggestion}`;
    }

    // Log
    await this.executionLogger.log({
      userId: executorId,
      username: executorTag,
      prompt,
      toolsExecuted: results,
      success: results.every(r => r.success),
      durationMs: Date.now() - startTime,
      timestamp: new Date(),
    }, client);

    return { responseText, results };
  }

  // ── Plan Preview ──────────────────────────────────────────────────────────

  private buildPlanEmbed(toolCalls: ToolCall[]): EmbedBuilder {
    const hasDangerous = toolCalls.some(tc => this.toolRegistry.isDangerous(tc.function.name));

    const steps = toolCalls.map((tc, i) => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* skip */ }
      const paramStr = Object.entries(args)
        .slice(0, 3)
        .map(([k, v]) => `${k}: **${String(v)}**`)
        .join(', ');
      const dangerous = this.toolRegistry.isDangerous(tc.function.name) ? ' ⚠️' : '';
      return `\`${i + 1}.\` \`${tc.function.name}\`${dangerous}${paramStr ? ` — ${paramStr}` : ''}`;
    }).join('\n');

    return new EmbedBuilder()
      .setColor(hasDangerous ? 0xf5a623 : 0x5865f2)
      .setTitle(`📋 Execution Plan — ${toolCalls.length} action${toolCalls.length > 1 ? 's' : ''}`)
      .setDescription(steps)
      .addFields({
        name: 'Risk Level',
        value: hasDangerous ? '⚠️ Contains destructive actions — review carefully' : '✅ Safe — all actions are reversible',
        inline: false,
      })
      .setFooter({ text: 'This plan expires in 60 seconds · Click Execute to proceed' });
  }

  private async showSlashPlanPreview(
    interaction: ChatInputCommandInteraction,
    toolCalls: ToolCall[],
    authorUserId: string,
  ): Promise<boolean> {
    const embed = this.buildPlanEmbed(toolCalls);
    const confirmId = `ai-plan-confirm-${interaction.id}`;
    const cancelId = `ai-plan-cancel-${interaction.id}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('✅  Execute').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(cancelId).setLabel('❌  Cancel').setStyle(ButtonStyle.Secondary),
    );

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    return new Promise(resolve => {
      const cleanup = (): void => {
        this.pendingButtons.delete(confirmId);
        this.pendingButtons.delete(cancelId);
      };

      const timeout = setTimeout(() => {
        cleanup();
        msg.edit({ components: [] }).catch(() => {});
        resolve(false);
      }, 60_000);

      this.pendingButtons.set(confirmId, {
        userId: authorUserId,
        executing: false,
        callback: async () => {
          cleanup();
          clearTimeout(timeout);
          await msg.edit({
            embeds: [embed.setColor(0x57f287).setTitle('⚙️ Executing...')],
            components: [],
          }).catch(() => {});
          resolve(true);
        },
      });

      this.pendingButtons.set(cancelId, {
        userId: authorUserId,
        executing: false,
        callback: async () => {
          cleanup();
          clearTimeout(timeout);
          await msg.edit({
            embeds: [embed.setColor(0x8e8e93).setTitle('❌ Cancelled').setFooter({ text: '' })],
            components: [],
          }).catch(() => {});
          resolve(false);
        },
      });
    });
  }

  private async showMessagePlanPreview(
    message: Message,
    toolCalls: ToolCall[],
    authorUserId: string,
    onConfirm: (toolCalls: ToolCall[]) => Promise<void>,
  ): Promise<void> {
    const embed = this.buildPlanEmbed(toolCalls);
    const confirmId = `ai-plan-confirm-${message.id}`;
    const cancelId = `ai-plan-cancel-${message.id}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('✅  Execute').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(cancelId).setLabel('❌  Cancel').setStyle(ButtonStyle.Secondary),
    );

    const reply = await message.reply({ embeds: [embed], components: [row] });

    const cleanup = (): void => {
      this.pendingButtons.delete(confirmId);
      this.pendingButtons.delete(cancelId);
    };

    const timeout = setTimeout(() => {
      cleanup();
      reply.edit({ components: [] }).catch(() => {});
    }, 60_000);

    const capturedToolCalls = toolCalls;

    this.pendingButtons.set(confirmId, {
      userId: authorUserId,
      executing: false,
      callback: async () => {
        cleanup();
        clearTimeout(timeout);
        try {
          await reply.edit({
            embeds: [embed.setColor(0x57f287).setTitle('⚙️ Executing...')],
            components: [],
          }).catch(() => {});
          await onConfirm(capturedToolCalls);
        } catch (error) {
          logger.error('Error during plan execution', error);
          await reply.edit({
            embeds: [embed.setColor(0xed4245).setTitle('❌ Execution Failed')],
            components: [],
          }).catch(() => {});
        }
      },
    });

    this.pendingButtons.set(cancelId, {
      userId: authorUserId,
      executing: false,
      callback: async () => {
        cleanup();
        clearTimeout(timeout);
        await reply.edit({
          embeds: [embed.setColor(0x8e8e93).setTitle('❌ Cancelled').setFooter({ text: '' })],
          components: [],
        }).catch(() => {});
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildMessages(userId: string, guildId: string): ConversationMessage[] {
    const memCtx = this.memoryManager.buildContextText(userId, guildId);
    return [
      { role: 'system', content: this.promptBuilder.build(memCtx) },
      ...this.memoryManager.getMessages(userId, guildId),
    ];
  }

  private async generateReflection(
    _userId: string,
    _guildId: string,
    results: ToolResult[],
  ): Promise<string | null> {
    try {
      const successCount = results.filter(r => r.success).length;
      const reflectionMessages: ConversationMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant. Respond with ONLY a single brief suggestion for what the user might want to add or improve next (1 sentence max), or respond with exactly "COMPLETE" if nothing more is needed.',
        },
        {
          role: 'user',
          content: `${successCount} action(s) were just completed. What should the user consider adding or configuring next?`,
        },
      ];
      const response = await this.planner.reflect(reflectionMessages);
      if (!response || response.trim() === 'COMPLETE') return null;
      return response.trim().slice(0, 200);
    } catch {
      return null;
    }
  }

  /** Flush workspace state on graceful shutdown before stopping memory cleanup. */
  stop(): void {
    this.workspaceMemory.flush().catch(err => logger.error('Workspace flush error on shutdown', err));
    this.memoryManager.stop();
  }

  // ── Workspace Sync Helper ─────────────────────────────────────────────────

  private syncToWorkspace(userId: string, guildId: string, msg: ConversationMessage): void {
    const wsId = this.memoryManager.getWorkspaceId(userId, guildId);
    if (wsId) this.workspaceMemory.addMessage(wsId, msg);
  }
}
