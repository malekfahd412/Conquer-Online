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
} from 'discord.js';
import type { ConversationMessage, ToolCall } from './types';
import { PermissionManager } from './permission-manager';
import { HistoryManager } from './history-manager';
import { ToolRegistry } from './tool-registry';
import { PromptBuilder } from './prompt-builder';
import { Planner } from './planner';
import { Executor } from './executor';
import { ActionValidator } from './action-validator';
import { ExecutionLogger } from './execution-logger';
import type { ToolResult } from './types';
import { logger } from '../utils/logger';

export interface AIConfig {
  serverName: string;
  adminRole: string;
  logChannelId: string | undefined;
  chatChannelId: string | undefined;
}

export class AIService {
  private readonly permissionManager: PermissionManager;
  private readonly historyManager: HistoryManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly promptBuilder: PromptBuilder;
  private readonly planner: Planner;
  private readonly executor: Executor;
  private readonly actionValidator: ActionValidator;
  private readonly executionLogger: ExecutionLogger;

  constructor(private readonly config: AIConfig) {
    this.permissionManager = new PermissionManager(config.adminRole);
    this.historyManager = new HistoryManager();
    this.toolRegistry = new ToolRegistry();
    this.promptBuilder = new PromptBuilder(config.serverName);
    this.planner = new Planner(this.toolRegistry);
    this.executor = new Executor(this.toolRegistry);
    this.actionValidator = new ActionValidator(this.toolRegistry);
    this.executionLogger = new ExecutionLogger(config.logChannelId);
  }

  start(client: Client): void {
    client.on('messageCreate', message => {
      this.onMessage(message, client).catch(error => {
        logger.error('AI message handler error', error);
      });
    });

    client.on('interactionCreate', interaction => {
      if (interaction.isChatInputCommand() && interaction.commandName === 'ai') {
        this.onSlashCommand(interaction as ChatInputCommandInteraction, client).catch(error => {
          logger.error('AI slash command error', error);
        });
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'clear') {
        this.onClearCommand(interaction as ChatInputCommandInteraction).catch(error => {
          logger.error('AI clear command error', error);
        });
        return;
      }
      this.actionValidator.handleInteraction(interaction).catch(error => {
        logger.error('AI interaction handler error', error);
      });
    });

    logger.success('AI Control Center is active');
    if (this.config.adminRole) logger.info(`AI admin role: "${this.config.adminRole}"`);
    if (this.config.chatChannelId) logger.info(`AI chat channel: ${this.config.chatChannelId}`);
    if (!this.config.logChannelId) logger.warning('CHANNEL_AI_LOG not set — execution logs will not be posted');
  }

  // ─── Clear Command Handler ────────────────────────────────────────────────

  private async onClearCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
      return;
    }

    const member = interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);

    if (!this.permissionManager.isAdmin(member)) {
      await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      return;
    }

    this.historyManager.clearChannel(interaction.channelId);
    logger.info(`Conversation history cleared for channel ${interaction.channelId} by ${interaction.user.tag}`);
    await interaction.reply({ content: '🧹 AI conversation history cleared for this channel. Starting fresh!', ephemeral: true });
  }

  // ─── Slash Command Handler ────────────────────────────────────────────────

  private async onSlashCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
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
    logger.info(`/ai from ${interaction.user.tag}: "${content}"`);

    try {
      this.historyManager.addUserMessage(interaction.channelId, content);

      const plan = await this.planner.plan(this.buildMessages(interaction.channelId));

      if (plan.kind === 'text') {
        this.historyManager.addAssistantMessage(interaction.channelId, { role: 'assistant', content: plan.content });
        await interaction.editReply({ content: plan.content });
        return;
      }

      if (this.actionValidator.hasDangerousActions(plan.toolCalls)) {
        const confirmed = await this.showSlashConfirmation(interaction, plan.toolCalls);
        if (!confirmed) return;
      }

      const { responseText, results } = await this.runToolsAndFinalize(
        interaction.channelId, plan.toolCalls, interaction.guild,
      );

      await interaction.editReply({ content: responseText });

      await this.executionLogger.log({
        userId: interaction.user.id,
        username: interaction.user.tag,
        prompt: content,
        toolsExecuted: results,
        success: results.every(r => r.success),
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      }, client);

    } catch (error) {
      logger.error('AI slash command execution error', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await interaction.editReply({ content: `❌ An error occurred: ${errMsg}` }).catch(() => {});
    }
  }

  private async showSlashConfirmation(
    interaction: ChatInputCommandInteraction,
    toolCalls: ToolCall[],
  ): Promise<boolean> {
    const dangerous = toolCalls.filter(tc => this.toolRegistry.isDangerous(tc.function.name));

    const actionLines = dangerous.map(tc => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* ignore */ }
      const paramStr = Object.entries(args).map(([k, v]) => `${k}: **${String(v)}**`).join(', ');
      const desc = this.toolRegistry.getDangerDescription(tc.function.name);
      return `• \`${tc.function.name}\`${paramStr ? ` — ${paramStr}` : ''}\n  _${desc}_`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle(`⚠️ Confirm — ${dangerous.length} Dangerous Action${dangerous.length > 1 ? 's' : ''}`)
      .setDescription(`The following action${dangerous.length > 1 ? 's' : ''} will be executed:\n\n${actionLines}`)
      .setFooter({ text: 'This confirmation expires in 60 seconds.' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ai-slash-confirm').setLabel('✅  Confirm').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ai-slash-cancel').setLabel('❌  Cancel').setStyle(ButtonStyle.Secondary),
    );

    const replyMsg = await interaction.editReply({ embeds: [embed], components: [row] });

    try {
      const btn = await replyMsg.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id,
        time: 60_000,
      });
      await btn.deferUpdate();

      if (btn.customId === 'ai-slash-confirm') {
        await interaction.editReply({ embeds: [embed.setColor(0x00d26a).setTitle('✅ Confirmed — Executing...')], components: [] });
        return true;
      }

      await interaction.editReply({
        embeds: [embed.setColor(0x8e8e93).setTitle('❌ Action Cancelled').setFooter({ text: '' })],
        components: [],
      });
      return false;

    } catch {
      await interaction.editReply({ components: [] }).catch(() => {});
      return false;
    }
  }

  // ─── Message Mention Handler ──────────────────────────────────────────────

  private async onMessage(message: Message, client: Client): Promise<void> {
    if (message.author.bot) return;
    if (!message.guild) return;

    const botUser = client.user;
    if (!botUser) return;

    const inAiChannel = this.config.chatChannelId
      ? message.channelId === this.config.chatChannelId
      : false;
    const mentionsBot = message.mentions.has(botUser.id);

    if (!inAiChannel && !mentionsBot) return;

    const member = message.member ?? await message.guild.members.fetch(message.author.id);
    if (!this.permissionManager.isAdmin(member)) {
      logger.info(`Ignored message from non-admin: ${message.author.tag}`);
      return;
    }

    const content = message.content
      .replace(`<@${botUser.id}>`, '')
      .replace(`<@!${botUser.id}>`, '')
      .trim();

    if (!content) return;

    const startTime = Date.now();
    logger.info(`AI @mention from ${message.author.tag}: "${content}"`);

    let typingInterval: ReturnType<typeof setInterval> | null = null;
    if (message.channel.isTextBased()) {
      const guildChannel = message.channel as GuildTextBasedChannel;
      await guildChannel.sendTyping().catch(() => {});
      typingInterval = setInterval(() => {
        (message.channel as GuildTextBasedChannel).sendTyping().catch(() => {});
      }, 8_000);
    }

    const stopTyping = (): void => {
      if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    };

    try {
      this.historyManager.addUserMessage(message.channelId, content);

      const plan = await this.planner.plan(this.buildMessages(message.channelId));

      if (plan.kind === 'text') {
        stopTyping();
        this.historyManager.addAssistantMessage(message.channelId, { role: 'assistant', content: plan.content });
        await message.reply({ content: plan.content });
        return;
      }

      if (this.actionValidator.hasDangerousActions(plan.toolCalls)) {
        stopTyping();
        await this.actionValidator.requestConfirmation(
          message,
          plan.toolCalls,
          async toolCalls => {
            const { responseText, results } = await this.runToolsAndFinalize(
              message.channelId, toolCalls, message.guild!,
            );
            await message.reply({ content: responseText }).catch(() => {});
            await this.executionLogger.log({
              userId: message.author.id,
              username: member.user.tag,
              prompt: content,
              toolsExecuted: results,
              success: results.every(r => r.success),
              durationMs: Date.now() - startTime,
              timestamp: new Date(),
            }, client);
          },
        );
        return;
      }

      stopTyping();
      const { responseText, results } = await this.runToolsAndFinalize(
        message.channelId, plan.toolCalls, message.guild,
      );
      await message.reply({ content: responseText }).catch(error => {
        logger.error('Failed to send AI response', error);
      });

      await this.executionLogger.log({
        userId: message.author.id,
        username: member.user.tag,
        prompt: content,
        toolsExecuted: results,
        success: results.every(r => r.success),
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      }, client);

    } catch (error) {
      stopTyping();
      logger.error('AI execution error', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await message.reply(`❌ An error occurred: ${errMsg}`).catch(() => {});
    }
  }

  // ─── Shared Pipeline Helpers ──────────────────────────────────────────────

  private buildMessages(channelId: string): ConversationMessage[] {
    return [
      { role: 'system', content: this.promptBuilder.build() },
      ...this.historyManager.getHistory(channelId),
    ];
  }

  private async runToolsAndFinalize(
    channelId: string,
    toolCalls: ToolCall[],
    guild: NonNullable<Message['guild']>,
  ): Promise<{ responseText: string; results: ToolResult[] }> {
    const results = await this.executor.execute(toolCalls, guild);

    this.historyManager.addAssistantMessage(channelId, {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls,
    });

    for (const result of results) {
      this.historyManager.addToolResult(
        channelId,
        result.toolCallId,
        JSON.stringify({ success: result.success, message: result.message }),
      );
    }

    const finalPlan = await this.planner.plan(this.buildMessages(channelId));

    let responseText: string;
    if (finalPlan.kind === 'text') {
      responseText = finalPlan.content;
      this.historyManager.addAssistantMessage(channelId, { role: 'assistant', content: responseText });
    } else {
      responseText = results.map(r => `${r.success ? '✅' : '❌'} ${r.message}`).join('\n');
    }

    return { responseText, results };
  }
}
