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
  ComponentType,
  AttachmentBuilder,
  type ActionRow,
  type ButtonComponent,
  type ButtonInteraction,
  type Client,
  type Guild,
  type MessageActionRowComponent,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { runMigration } from './migration';
import { panelManager, PanelManager } from './panel-manager';
import { ticketEngine, TicketEngine } from './ticket-engine';
import { permissionEngine } from './permission-engine';
import { questionEngine, TICKET_TYPE_ANSWER_KEY } from './question-engine';
import { answerEngine, AnswerEngine } from './answer-engine';
import { automationEngine } from './automation-engine';
import { statisticsEngine, StatisticsEngine } from './statistics-engine';
import { templateEngine, TemplateEngine } from './template-engine';
import { namingEngine, NamingEngine } from './naming-engine';
import { categoryEngine, CategoryEngine } from './category-engine';
import { transcriptEngine, TranscriptEngine } from './transcript-engine';
import { genId } from './store';
import type { TicketForm, TicketPanel } from './types';
import { getEntry, entryRefForTicketType, resolveTicketType } from './types';
import { logger } from '../../utils/logger';

export * from './types';

interface PendingFormFlow {
  panelId: string;
  ticketType: string;
  answers: Record<string, string>;
  formIds: string[];
  startedAt: number;
  prefill?: Record<string, string>;
}

const FLOW_TTL_MS = 30 * 60 * 1000;

class TicketSystem {
  readonly panels: PanelManager = panelManager;
  readonly tickets: TicketEngine = ticketEngine;
  readonly statistics: StatisticsEngine = statisticsEngine;
  readonly templates: TemplateEngine = templateEngine;
  readonly naming: NamingEngine = namingEngine;
  readonly categories: CategoryEngine = categoryEngine;
  readonly transcripts: TranscriptEngine = transcriptEngine;
  readonly answers: AnswerEngine = answerEngine;

  private client?: Client;
  private sweepHandle?: NodeJS.Timeout;
  private flowSweepHandle?: NodeJS.Timeout;
  /** In-memory state for multi-form chains (a form's `nextRules` can route to another form before a ticket is created). */
  private readonly pendingFlows = new Map<string, PendingFormFlow>();

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
      answerEngine.ensureFile(),
    ]);
    this.sweepHandle = automationEngine.createInactivitySweeper(ticketId => this.autoCloseIfInactive(ticketId));
    this.flowSweepHandle = setInterval(() => {
      const cutoff = Date.now() - FLOW_TTL_MS;
      for (const [id, flow] of this.pendingFlows) {
        if (flow.startedAt < cutoff) this.pendingFlows.delete(id);
      }
    }, 5 * 60 * 1000);
    logger.success('[TICKETS] Ticket System Pro online — 11 engines wired (naming, category, permission, question, answer, transcript, automation, statistics, template, panel, ticket).');
  }

  shutdown(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
    if (this.flowSweepHandle) clearInterval(this.flowSweepHandle);
  }

  /** Which TicketForm (if any) a given ticket-opening button/select-option starts. Falls back to the legacy `modal` when unset. */
  private resolveEntryFormId(panel: TicketPanel, ticketType: string): string | undefined {
    const ref = entryRefForTicketType(panel, ticketType);
    return ref ? getEntry(panel, ref)?.formId : undefined;
  }

  private async autoCloseIfInactive(ticketId: string): Promise<void> {
    if (!this.client) return;
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket || ticket.status !== 'open') {
      await automationEngine.clearActivity(ticketId);
      return;
    }
    const rawPanel = await panelManager.get(ticket.panelId);
    if (!rawPanel) return;
    const cfg = resolveTicketType(rawPanel, ticket.ticketType);
    if (cfg.automation.autoCloseInactivityMinutes <= 0) return;

    const inactiveIds = await automationEngine.getInactiveTicketIds(cfg.automation.autoCloseInactivityMinutes);
    if (!inactiveIds.includes(ticketId)) return;

    const guild = await this.client.guilds.fetch(ticket.guildId).catch(() => null);
    if (!guild) return;

    await ticketEngine.close(guild, cfg, ticket, this.client.user?.id ?? 'automation', 'inactivity auto-close');
    await automationEngine.logAction(ticketId, 'auto-close');
    logger.info(`[TICKETS] Auto-closed inactive ticket #${ticket.number} (panel ${cfg.id}, type ${ticket.ticketType})`);
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
    const cfg = resolveTicketType(panel, ticketType);
    const block = await ticketEngine.checkCanOpen(cfg, member, interaction.user.id, ticketType);
    if (block) {
      await interaction.reply({ content: `❌ ${block}`, ephemeral: true });
      return;
    }

    const formId = this.resolveEntryFormId(panel, ticketType);
    const form = formId ? panel.forms.find(f => f.id === formId) : undefined;
    if (form && form.questions.length > 0) {
      const flowId = genId('flow');
      this.pendingFlows.set(flowId, { panelId, ticketType, answers: {}, formIds: [], startedAt: Date.now() });
      const knownAnswers = { [TICKET_TYPE_ANSWER_KEY]: ticketType };
      await interaction.showModal(questionEngine.buildFormModal(`tk:form:${panelId}:${ticketType}:${form.id}:${flowId}`, form, knownAnswers));
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
    usedForms: TicketForm[] = [],
  ): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const extraAnswerFields = usedForms.length > 0 ? questionEngine.formatFormAnswersForEmbed(usedForms, answers) : [];
    const cfg = resolveTicketType(panel, ticketType);
    const { ticket, channel } = await ticketEngine.createChannel(
      guild,
      cfg,
      { id: interaction.user.id, username: interaction.user.username, displayName: interaction.user.displayName ?? interaction.user.username, tag: interaction.user.tag },
      ticketType,
      answers,
      extraAnswerFields,
    );
    await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });

    if (usedForms.length > 0) {
      const lastForm = usedForms[usedForms.length - 1];
      await answerEngine.record({
        guildId: guild.id,
        panelId: panel.id,
        panelName: panel.name,
        formId: lastForm.id,
        formName: lastForm.name,
        ticketType,
        ticketId: ticket.id,
        channelId: channel.id,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        answers: usedForms.flatMap(f => f.questions.filter(q => answers[q.id]).map(q => ({ questionId: q.id, title: q.title, type: q.type, value: answers[q.id] }))),
      }).catch(err => logger.error('[TICKETS] Failed to persist form answers', err));

      const summaryEmbed = questionEngine.buildAnswerSummaryEmbed({
        forms: usedForms,
        answers,
        userTag: interaction.user.tag,
        submittedAt: Date.now(),
        color: panel.embed.color,
      });
      await channel.send({ embeds: [summaryEmbed] }).catch(() => {});
    }
  }

  private async handleFormModal(interaction: ModalSubmitInteraction, guild: Guild, parts: string[]): Promise<void> {
    const [, , panelId, ticketType, formId, flowId] = parts;
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }
    const form = panel.forms.find(f => f.id === formId);
    if (!form) {
      await interaction.reply({ content: '❌ This form no longer exists.', ephemeral: true });
      return;
    }
    const member = interaction.member instanceof GuildMember ? interaction.member : null;
    const block = await ticketEngine.checkCanOpen(resolveTicketType(panel, ticketType), member, interaction.user.id, ticketType);
    if (block) {
      await interaction.reply({ content: `❌ ${block}`, ephemeral: true });
      return;
    }

    const flow = this.pendingFlows.get(flowId) ?? { panelId, ticketType, answers: {}, formIds: [], startedAt: Date.now() };
    const knownAnswers = { [TICKET_TYPE_ANSWER_KEY]: ticketType, ...flow.answers };
    const result = questionEngine.validateForm(interaction, form, knownAnswers);

    if (!result.ok) {
      const prefill: Record<string, string> = {};
      for (const q of questionEngine.visibleQuestions(form, knownAnswers)) {
        try {
          prefill[q.id] = interaction.fields.getTextInputValue(q.id);
        } catch {
          // Question wasn't rendered in this particular submission — nothing to prefill.
        }
      }
      this.pendingFlows.set(flowId, { ...flow, prefill });
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('⚠️ Please fix the following')
        .setDescription(result.errors.map(e => `• **${e.title}:** ${e.message}`).join('\n'));
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tk:formretry:${panelId}:${ticketType}:${formId}:${flowId}`).setLabel('Try Again').setStyle(ButtonStyle.Primary).setEmoji('🔁'),
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    const mergedAnswers = { ...flow.answers, ...result.answers };
    const usedFormIds = [...flow.formIds, formId];
    const nextFormId = questionEngine.pickNextFormId(form, result.answers);
    const nextForm = nextFormId && !usedFormIds.includes(nextFormId) ? panel.forms.find(f => f.id === nextFormId) : undefined;

    if (nextForm) {
      this.pendingFlows.set(flowId, { panelId, ticketType, answers: mergedAnswers, formIds: usedFormIds, startedAt: flow.startedAt });
      const knownAnswers2 = { [TICKET_TYPE_ANSWER_KEY]: ticketType, ...mergedAnswers };
      await interaction.showModal(questionEngine.buildFormModal(`tk:form:${panelId}:${ticketType}:${nextForm.id}:${flowId}`, nextForm, knownAnswers2));
      return;
    }

    this.pendingFlows.delete(flowId);
    const usedForms = usedFormIds.map(id => panel.forms.find(f => f.id === id)).filter((f): f is TicketForm => !!f);
    await this.createTicketChannel(interaction, guild, panelId, ticketType, mergedAnswers, usedForms);
  }

  private async retryFormModal(interaction: ButtonInteraction, _guild: Guild, panelId: string, ticketType: string, formId: string, flowId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms.find(f => f.id === formId);
    if (!panel || !form) {
      await interaction.reply({ content: '❌ This form no longer exists.', ephemeral: true });
      return;
    }
    const flow = this.pendingFlows.get(flowId);
    const knownAnswers = { [TICKET_TYPE_ANSWER_KEY]: ticketType, ...(flow?.answers ?? {}) };
    await interaction.showModal(questionEngine.buildFormModal(`tk:form:${panelId}:${ticketType}:${formId}:${flowId}`, form, knownAnswers, flow?.prefill));
  }

  async handleModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    try {
      const parts = interaction.customId.split(':');
      if (parts[1] === 'form') {
        await this.handleFormModal(interaction, guild, parts);
        return;
      }

      const [, , panelId, ticketType] = parts;
      const panel = await panelManager.get(panelId);
      if (!panel) {
        await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
        return;
      }
      const member = interaction.member instanceof GuildMember ? interaction.member : null;
      const block = await ticketEngine.checkCanOpen(resolveTicketType(panel, ticketType), member, interaction.user.id, ticketType);
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
    const parts = interaction.customId.split(':');
    const [, action, a, b] = parts;
    try {
      switch (action) {
        case 'open':
          await this.startOpenFlow(interaction, guild, a, b);
          break;
        case 'formretry': {
          const [, , panelId, ticketType, formId, flowId] = parts;
          await this.retryFormModal(interaction, guild, panelId, ticketType, formId, flowId);
          break;
        }
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
    const rawPanel = await panelManager.get(ticket.panelId);
    if (!rawPanel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }
    const cfg = resolveTicketType(rawPanel, ticket.ticketType);
    const member = interaction.member instanceof GuildMember ? interaction.member : null;

    if (claim) {
      const staffRoleIds = new Set([...cfg.supportRoles, ...cfg.managerRoles, ...cfg.adminRoles]);
      const memberRoleIds = member ? Array.from(member.roles.cache.keys()) : [];
      const isStaff = memberRoleIds.some(id => staffRoleIds.has(id));
      if (!isStaff) {
        await interaction.reply({ content: '❌ You are not allowed to claim this ticket.', ephemeral: true });
        return;
      }
      if (ticket.claimedBy) {
        await interaction.reply({ content: `❌ This ticket has already been claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
        return;
      }
    }

    const updated = await ticketEngine.claim(guild, cfg, ticketId, interaction.user.id, claim);
    if (claim && updated?.claimedBy !== interaction.user.id) {
      // Lost a race with another staff member's claim between the check above and here.
      await interaction.reply({ content: `❌ This ticket has already been claimed by <@${updated?.claimedBy}>.`, ephemeral: true });
      return;
    }

    await interaction.reply({ content: claim ? `🙋 ${interaction.user} claimed this ticket.` : `↩️ ${interaction.user} unclaimed this ticket.` });
    await this.updateClaimHeader(interaction, claim ? interaction.user.id : undefined);
  }

  /** Updates the original ticket header message (embed field + Claim button state) to reflect the current claim status. */
  private async updateClaimHeader(interaction: ButtonInteraction, claimedBy: string | undefined): Promise<void> {
    const message = interaction.message;
    if (!message) return;
    try {
      const sourceEmbed = message.embeds[0];
      const embed = sourceEmbed ? EmbedBuilder.from(sourceEmbed) : new EmbedBuilder();
      const existingFields = sourceEmbed?.fields?.filter(f => f.name !== 'Claimed by') ?? [];
      embed.setFields(claimedBy ? [...existingFields, { name: 'Claimed by', value: `<@${claimedBy}>` }] : existingFields);

      const rows = message.components
        .filter((row): row is ActionRow<MessageActionRowComponent> => row.type === ComponentType.ActionRow)
        .map(row => {
          const buttons = row.components.map(component => {
            const built = ButtonBuilder.from(component as ButtonComponent);
            if ((component as ButtonComponent).customId?.startsWith('tk:claim:')) {
              built.setDisabled(!!claimedBy).setLabel(claimedBy ? 'Claimed' : 'Claim').setEmoji(claimedBy ? '✅' : '🙋');
            }
            return built;
          });
          return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        });

      await message.edit({ embeds: [embed], components: rows });
    } catch (err) {
      logger.warning('[TICKETS] Failed to update ticket header after claim change', err);
    }
  }

  private async closeTicket(interaction: ButtonInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    const rawPanel = await panelManager.get(ticket.panelId);
    if (!rawPanel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }
    const cfg = resolveTicketType(rawPanel, ticket.ticketType);
    await interaction.deferUpdate();
    await ticketEngine.close(guild, cfg, ticket, interaction.user.id, interaction.user.tag);

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
