// ─────────────────────────────────────────────────────────────────────────────
// Ticket System Pro — public facade.
//
// This is the only file the rest of the bot (ai.service.ts, AI tools) should
// import from. It wires the ten engines together and owns Discord interaction
// routing so the `tk:*` custom ID contract stays identical to the legacy
// system — every panel message already posted in Discord keeps working.
// ─────────────────────────────────────────────────────────────────────────────
import {
  GuildMember,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  type ButtonInteraction,
  type Client,
  type Guild,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { runMigration } from './migration';
import { panelManager, PanelManager } from './panel-manager';
import { ticketEngine, TicketEngine } from './ticket-engine';
import { permissionEngine } from './permission-engine';
import { questionEngine } from './question-engine';
import { automationEngine } from './automation-engine';
import { statisticsEngine, StatisticsEngine } from './statistics-engine';
import { templateEngine, TemplateEngine } from './template-engine';
import { namingEngine, NamingEngine } from './naming-engine';
import { categoryEngine, CategoryEngine } from './category-engine';
import { transcriptEngine, TranscriptEngine } from './transcript-engine';
import { logger } from '../../utils/logger';

export * from './types';

class TicketSystem {
  readonly panels: PanelManager = panelManager;
  readonly tickets: TicketEngine = ticketEngine;
  readonly statistics: StatisticsEngine = statisticsEngine;
  readonly templates: TemplateEngine = templateEngine;
  readonly naming: NamingEngine = namingEngine;
  readonly categories: CategoryEngine = categoryEngine;
  readonly transcripts: TranscriptEngine = transcriptEngine;

  private client?: Client;
  private sweepHandle?: NodeJS.Timeout;

  async init(client: Client): Promise<void> {
    this.client = client;
    await runMigration();
    await Promise.all([
      panelManager.ensureFile(),
      ticketEngine.ensureFile(),
      templateEngine.ensureFile(),
      statisticsEngine.ensureFile(),
      automationEngine.ensureFile(),
      transcriptEngine.ensureFile(),
    ]);
    this.sweepHandle = automationEngine.createInactivitySweeper(ticketId => this.autoCloseIfInactive(ticketId));
    logger.success('[TICKETS] Ticket System Pro online — 10 engines wired (naming, category, permission, question, transcript, automation, statistics, template, panel, ticket).');
  }

  shutdown(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
  }

  private async autoCloseIfInactive(ticketId: string): Promise<void> {
    if (!this.client) return;
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket || ticket.status !== 'open') {
      await automationEngine.clearActivity(ticketId);
      return;
    }
    const panel = await panelManager.get(ticket.panelId);
    if (!panel || panel.automation.autoCloseInactivityMinutes <= 0) return;

    const inactiveIds = await automationEngine.getInactiveTicketIds(panel.automation.autoCloseInactivityMinutes);
    if (!inactiveIds.includes(ticketId)) return;

    const guild = await this.client.guilds.fetch(ticket.guildId).catch(() => null);
    if (!guild) return;

    await ticketEngine.close(guild, panel, ticket, this.client.user?.id ?? 'automation', 'inactivity auto-close');
    await automationEngine.logAction(ticketId, 'auto-close');
    logger.info(`[TICKETS] Auto-closed inactive ticket #${ticket.number} (panel ${panel.id})`);
  }

  /** Full panel-open flow shared by button clicks and select-menu selections. */
  private async startOpenFlow(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    guild: Guild,
    panelId: string,
    ticketType: string,
  ): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }

    const member = interaction.member instanceof GuildMember ? interaction.member : null;
    const block = await ticketEngine.checkCanOpen(panel, member, interaction.user.id);
    if (block) {
      await interaction.reply({ content: `❌ ${block}`, ephemeral: true });
      return;
    }

    if (questionEngine.hasQuestions(panel.modal)) {
      await interaction.showModal(questionEngine.buildModal(`tk:modal:${panelId}:${ticketType}`, panel.modal));
      return;
    }

    await this.createTicketChannel(interaction, guild, panel.id, ticketType, {});
  }

  private async createTicketChannel(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
    guild: Guild,
    panelId: string,
    ticketType: string,
    answers: Record<string, string>,
  ): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const { channel } = await ticketEngine.createChannel(
      guild,
      panel,
      { id: interaction.user.id, username: interaction.user.username, displayName: interaction.user.displayName ?? interaction.user.username, tag: interaction.user.tag },
      ticketType,
      answers,
    );
    await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
  }

  async handleModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    try {
      const [, , panelId, ticketType] = interaction.customId.split(':');
      const panel = await panelManager.get(panelId);
      if (!panel) {
        await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
        return;
      }
      const member = interaction.member instanceof GuildMember ? interaction.member : null;
      const block = await ticketEngine.checkCanOpen(panel, member, interaction.user.id);
      if (block) {
        await interaction.reply({ content: `❌ ${block}`, ephemeral: true });
        return;
      }
      const answers = questionEngine.parseSubmission(interaction, panel.modal);
      await this.createTicketChannel(interaction, guild, panelId, ticketType, answers);
    } catch (err) {
      logger.error('[TICKETS] Modal handling error', err);
      await this.replyError(interaction);
    }
  }

  async handleSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    try {
      const [, , panelId] = interaction.customId.split(':');
      const ticketType = interaction.values[0];
      await this.startOpenFlow(interaction, guild, panelId, ticketType);
    } catch (err) {
      logger.error('[TICKETS] Select menu handling error', err);
      await this.replyError(interaction);
    }
  }

  async handleInteraction(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const [, action, a, b] = interaction.customId.split(':');
    try {
      switch (action) {
        case 'open':
          await this.startOpenFlow(interaction, guild, a, b);
          break;
        case 'claim':
          await this.claim(interaction, guild, a, true);
          break;
        case 'unclaim':
          await this.claim(interaction, guild, a, false);
          break;
        case 'close':
          await this.closeTicket(interaction, guild, a);
          break;
        case 'reopen':
          await this.reopenTicket(interaction, guild, a);
          break;
        case 'delete':
          await this.deleteTicketChannel(interaction, guild, a);
          break;
        case 'transcript':
          await this.sendTranscript(interaction, guild, a);
          break;
        default:
          await interaction.reply({ content: '❌ Unknown ticket action.', ephemeral: true });
      }
    } catch (err) {
      logger.error('[TICKETS] Ticket interaction error', err);
      await this.replyError(interaction);
    }
  }

  private async claim(interaction: ButtonInteraction, guild: Guild, ticketId: string, claim: boolean): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    await ticketEngine.claim(guild, ticketId, interaction.user.id, claim);
    await interaction.reply({ content: claim ? `🙋 ${interaction.user} claimed this ticket.` : `↩️ ${interaction.user} unclaimed this ticket.` });
  }

  private async closeTicket(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    const panel = await panelManager.get(ticket.panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    await ticketEngine.close(guild, panel, ticket, interaction.user.id, interaction.user.tag);

    const embed = new EmbedBuilder().setColor(0xed4245).setDescription(`🔒 Ticket closed by ${interaction.user}.`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk:reopen:${ticket.id}`).setLabel('Reopen').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId(`tk:delete:${ticket.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`tk:transcript:${ticket.id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );
    await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => {});
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
  }

  private async reopenTicket(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    await ticketEngine.reopen(guild, ticket, interaction.user.id);
    await interaction.reply({ content: `🔓 Ticket reopened by ${interaction.user}.` });
  }

  private async deleteTicketChannel(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    await interaction.reply({ content: '🗑️ Deleting ticket channel in 5 seconds...' });
    setTimeout(async () => {
      const channel = await guild.channels.fetch(interaction.channelId).catch(() => null);
      await channel?.delete().catch(() => {});
    }, 5000);
    if (ticket) await ticketEngine.delete(ticket, interaction.user.id);
  }

  private async sendTranscript(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.editReply('❌ Ticket channel not found.');
      return;
    }
    const result = await transcriptEngine.generate(channel);
    await transcriptEngine.persist(ticket, result);
    const file = new AttachmentBuilder(Buffer.from(result.html, 'utf-8'), { name: `ticket-${ticket.number}.html` });
    await interaction.editReply({ content: `📄 Transcript generated (${result.messageCount} messages).`, files: [file] });
  }

  private async replyError(interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction): Promise<void> {
    const payload = { content: '❌ An error occurred processing this ticket action.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }

  /** Convenience used by AI tools: gate + resolve name/permission checks are handled inside. */
  canOpen = permissionEngine.canOpen.bind(permissionEngine);
}

export const ticketSystem = new TicketSystem();
