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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ChatInputCommandInteraction,
  type ActionRow,
  type ButtonComponent,
  type Client,
  type Guild,
  type Message,
  type MessageActionRowComponent,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
  type TextChannel,
} from 'discord.js';
import { runMigration, runNamingMigrationV2, runNamingMigrationV3 } from './migration';
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
import type { TicketForm, TicketPanel, TicketPriority, TicketRecord, TicketReviewRecord, ReviewConfig } from './types';
import { getEntry, entryRefForTicketType, resolveTicketType, DEFAULT_REVIEW_CONFIG } from './types';
import { reviewEngine, ReviewEngine, STAR_LABELS } from './review-engine';
import { slaEngine } from './sla-engine';
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
  /** Ticket reviews, exposed for external consumers like the Support Inbox conversation header. */
  readonly reviews: ReviewEngine = reviewEngine;

  private client?: Client;
  private sweepHandle?: NodeJS.Timeout;
  private flowSweepHandle?: NodeJS.Timeout;
  private weeklyStatsHandle?: NodeJS.Timeout;
  private slaSweepHandle?: NodeJS.Timeout;
  /** Tracks the last time a weekly stats embed was posted per panel, so we never double-post. */
  private readonly lastWeeklyPost = new Map<string, number>();
  /** In-memory state for multi-form chains (a form's `nextRules` can route to another form before a ticket is created). */
  private readonly pendingFlows = new Map<string, PendingFormFlow>();
  /** Pending ratings from star-button clicks; keyed `<ticketId>:<userId>`, cleared on modal submit or TTL. */
  private readonly pendingReviews = new Map<string, 1 | 2 | 3 | 4 | 5>();

  async init(client: Client): Promise<void> {
    this.client = client;
    await runMigration();
    await runNamingMigrationV2();
    await runNamingMigrationV3();
    await Promise.all([
      panelManager.ensureFile(),
      ticketEngine.ensureFile(),
      templateEngine.ensureFile(),
      statisticsEngine.ensureFile(),
      automationEngine.ensureFile(),
      transcriptEngine.ensureFile(),
      answerEngine.ensureFile(),
      slaEngine.ensureFile(),
      reviewEngine.ensureFile(),
    ]);
    this.sweepHandle = automationEngine.createInactivitySweeper(ticketId => this.runTicketAutomation(ticketId));
    this.slaSweepHandle = slaEngine.createSweeper(client);
    this.weeklyStatsHandle = setInterval(() => this.runWeeklyStatsCheck().catch(err => logger.warning('[TICKETS] Weekly stats check failed', err)), 60 * 60_000);
    this.flowSweepHandle = setInterval(() => {
      const cutoff = Date.now() - FLOW_TTL_MS;
      for (const [id, flow] of this.pendingFlows) {
        if (flow.startedAt < cutoff) this.pendingFlows.delete(id);
      }
    }, 5 * 60 * 1000);
    logger.success('[TICKETS] Ticket System Pro online — 13 engines wired (naming, category, permission, question, answer, transcript, automation, statistics, template, panel, ticket, sla, review).');
  }

  shutdown(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
    if (this.flowSweepHandle) clearInterval(this.flowSweepHandle);
    if (this.weeklyStatsHandle) clearInterval(this.weeklyStatsHandle);
    if (this.slaSweepHandle) clearInterval(this.slaSweepHandle);
  }

  /** Which TicketForm (if any) a given ticket-opening button/select-option starts. Falls back to the legacy `modal` when unset. */
  private resolveEntryFormId(panel: TicketPanel, ticketType: string): string | undefined {
    const ref = entryRefForTicketType(panel, ticketType);
    return ref ? getEntry(panel, ref)?.formId : undefined;
  }

  private async runTicketAutomation(ticketId: string): Promise<void> {
    if (!this.client) return;
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket || ticket.status !== 'open') {
      await automationEngine.clearActivity(ticketId);
      return;
    }
    const rawPanel = await panelManager.get(ticket.panelId);
    if (!rawPanel) return;
    const cfg = resolveTicketType(rawPanel, ticket.ticketType);

    // ── Age warning — ping support roles once when ticket goes quiet ──────────
    const ageWarnMinutes = cfg.automation.ageWarnMinutes ?? 0;
    if (ageWarnMinutes > 0) {
      const needsWarn = await automationEngine.getTicketsNeedingAgeWarn(ageWarnMinutes);
      if (needsWarn.includes(ticketId)) {
        const guild = await this.client.guilds.fetch(ticket.guildId).catch(() => null);
        if (guild) {
          const ch = await guild.channels.fetch(ticket.channelId).catch(() => null) as TextChannel | null;
          if (ch) {
            const pings = cfg.supportRoles.map(id => `<@&${id}>`).join(' ');
            const hoursText = ageWarnMinutes >= 60 ? `${Math.round(ageWarnMinutes / 60)}h` : `${ageWarnMinutes}m`;
            await ch.send({
              content: pings ? `${pings} ⚠️ This ticket has had no activity for **${hoursText}** and may need attention.` : `⚠️ This ticket has had no activity for **${hoursText}** and may need attention.`,
            }).catch(() => {});
            await automationEngine.markWarned(ticketId);
            logger.info(`[TICKETS] Age warning sent for ticket #${ticket.number} (inactive ${hoursText})`);
          }
        }
      }
    }

    // ── Auto-close on inactivity ──────────────────────────────────────────────
    if (cfg.automation.autoCloseInactivityMinutes <= 0) return;
    const inactiveIds = await automationEngine.getInactiveTicketIds(cfg.automation.autoCloseInactivityMinutes);
    if (!inactiveIds.includes(ticketId)) return;

    const guild = await this.client.guilds.fetch(ticket.guildId).catch(() => null);
    if (!guild) return;

    await ticketEngine.close(guild, cfg, ticket, this.client.user?.id ?? 'automation', 'inactivity auto-close');
    await automationEngine.logAction(ticketId, 'auto-close');
    logger.info(`[TICKETS] Auto-closed inactive ticket #${ticket.number} (panel ${cfg.id}, type ${ticket.ticketType})`);
  }

  private async runWeeklyStatsCheck(): Promise<void> {
    if (!this.client) return;
    const now = new Date();
    if (now.getUTCDay() !== 1) return; // 1 = Monday
    const sinceMs = Date.now() - 7 * 24 * 60 * 60_000;

    const panels = await panelManager.getAll();
    for (const panel of panels) {
      if (!panel.statsChannelId) continue;
      const lastPost = this.lastWeeklyPost.get(panel.id) ?? 0;
      if (Date.now() - lastPost < 5 * 24 * 60 * 60_000) continue; // already posted this week

      try {
        const guild = await this.client.guilds.fetch(panel.guildId).catch(() => null);
        if (!guild) continue;
        const ch = await guild.channels.fetch(panel.statsChannelId).catch(() => null) as TextChannel | null;
        if (!ch) continue;

        const stats = await statisticsEngine.getWeeklyStats(panel.guildId, sinceMs, panel.id);
        const fmtTime = (ms: number) => ms > 0 ? (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`) : '_N/A_';
        const topStaffLines = stats.topStaff.length
          ? stats.topStaff.map(([id, n], i) => `${i + 1}. <@${id}> — ${n} claim${n !== 1 ? 's' : ''}`).join('\n')
          : '_No claims this week_';

        const embed = new EmbedBuilder()
          .setColor(panel.embed.color)
          .setTitle(`📊 Weekly Stats — ${panel.name}`)
          .setDescription(`Summary for the 7 days ending <t:${Math.floor(Date.now() / 1000)}:D>`)
          .addFields(
            { name: '🎫 Opened', value: String(stats.opened), inline: true },
            { name: '✅ Closed', value: String(stats.closed), inline: true },
            { name: '⏱ Avg First Response', value: fmtTime(stats.avgResponseMs), inline: true },
            { name: '🏆 Top Staff (by claims)', value: topStaffLines, inline: false },
          )
          .setFooter({ text: `Panel: ${panel.name} • Auto-posted every Monday` })
          .setTimestamp();

        await ch.send({ embeds: [embed] });
        this.lastWeeklyPost.set(panel.id, Date.now());
        logger.info(`[TICKETS] Weekly stats posted for panel "${panel.name}" → #${panel.statsChannelId}`);
      } catch (err) {
        logger.warning(`[TICKETS] Failed to post weekly stats for panel ${panel.id}`, err);
      }
    }
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
      {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName:
          (interaction.member instanceof GuildMember ? interaction.member.displayName : null)
          ?? interaction.user.globalName
          ?? interaction.user.username,
        tag: interaction.user.tag,
      },
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

  /**
   * The single staff gate shared by the claim button and every staff-only `/ticket`
   * subcommand (add, remove, rename, priority) — `resolveTicketType`'s `cfg` must be
   * passed in so per-ticket-type role overrides apply exactly as they do for claiming.
   */
  private isStaffMember(cfg: TicketPanel, member: GuildMember | null): boolean {
    const staffRoleIds = new Set([...cfg.supportRoles, ...cfg.managerRoles, ...cfg.adminRoles]);
    const memberRoleIds = member ? Array.from(member.roles.cache.keys()) : [];
    return memberRoleIds.some(id => staffRoleIds.has(id));
  }

  /** Shared by the legacy `tk:claim:`/`tk:unclaim:` buttons and `/ticket claim`/`/ticket unclaim` — identical logic either way. */
  private async claim(interaction: ButtonInteraction | ChatInputCommandInteraction, guild: Guild, ticketId: string, claim: boolean): Promise<void> {
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
      if (!this.isStaffMember(cfg, member)) {
        await interaction.reply({ content: '❌ You are not allowed to claim this ticket.', ephemeral: true });
        return;
      }
      if (ticket.claimedBy) {
        await interaction.reply({ content: `❌ This ticket has already been claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
        return;
      }
    } else if (!ticket.claimedBy) {
      await interaction.reply({ content: '❌ This ticket is not currently claimed.', ephemeral: true });
      return;
    }

    const updated = await ticketEngine.claim(guild, cfg, ticketId, interaction.user.id, claim);
    if (claim && updated?.claimedBy !== interaction.user.id) {
      // Lost a race with another staff member's claim between the check above and here.
      await interaction.reply({ content: `❌ This ticket has already been claimed by <@${updated?.claimedBy}>.`, ephemeral: true });
      return;
    }

    await interaction.reply({ content: claim ? `🙋 ${interaction.user} claimed this ticket.` : `↩️ ${interaction.user} unclaimed this ticket.` });

    // Buttons carry their own message to patch in place; slash callers have no message,
    // so locate the ticket's header (works for both legacy claim-button headers and the
    // newer Close-only headers) and sync it the same way.
    const message = interaction instanceof ButtonInteraction ? interaction.message : await this.findTicketHeaderMessage(guild, ticket);
    if (message) await this.applyClaimHeaderUpdate(message, claim ? interaction.user.id : undefined);
  }

  /**
   * Locates a ticket's header message so both button and slash callers can sync its
   * "Claimed by" state. Prefers a message still carrying a `tk:claim:<id>` button
   * (legacy headers, posted before the member header was simplified to Close-only);
   * falls back to the very first message ever sent in the channel, which is always
   * the welcome header regardless of which buttons it carries.
   */
  private async findTicketHeaderMessage(guild: Guild, ticket: TicketRecord): Promise<Message | undefined> {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.isTextBased()) return undefined;
    try {
      const recent = await (channel as TextChannel).messages.fetch({ limit: 50 });
      const withClaimButton = recent.find(m =>
        m.components.some(row =>
          row.type === ComponentType.ActionRow &&
          (row as ActionRow<MessageActionRowComponent>).components.some(
            c => (c as ButtonComponent).customId === `tk:claim:${ticket.id}`,
          ),
        ),
      );
      if (withClaimButton) return withClaimButton;

      const oldest = await (channel as TextChannel).messages.fetch({ after: '0', limit: 1 });
      return oldest.first();
    } catch (err) {
      logger.warning('[TICKETS] Failed to locate ticket header message for claim sync', err);
      return undefined;
    }
  }

  /** Updates the original ticket header message (embed field + Claim button state) to reflect the current claim status. */
  private async applyClaimHeaderUpdate(message: Message, claimedBy: string | undefined): Promise<void> {
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

  private async closeTicket(interaction: ButtonInteraction | ChatInputCommandInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    if (ticket.status === 'closed') {
      await interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
      return;
    }
    const rawPanel = await panelManager.get(ticket.panelId);
    if (!rawPanel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }
    const cfg = resolveTicketType(rawPanel, ticket.ticketType);
    const isButton = interaction instanceof ButtonInteraction;
    // For a button click, the button lives on the permanent header — deferUpdate() acknowledges
    // the interaction WITHOUT editing that message, so the header stays untouched forever. For a
    // slash command, deferReply() creates a separate, throwaway ephemeral acknowledgment.
    if (isButton) await interaction.deferUpdate();
    else await interaction.deferReply({ ephemeral: true });
    await ticketEngine.close(guild, cfg, ticket, interaction.user.id, interaction.user.tag);

    const embed = new EmbedBuilder().setColor(0xed4245).setDescription(`🔒 Ticket closed by ${interaction.user}.`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk:reopen:${ticket.id}`).setLabel('Reopen').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId(`tk:delete:${ticket.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`tk:transcript:${ticket.id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );
    // Always a brand-new message — the header (welcome message) is never edited or replaced, and
    // neither is any earlier lifecycle message. Its ID is tracked so a later reopen can disable
    // these controls without touching anything else.
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const sent = await (channel as TextChannel).send({ embeds: [embed], components: [row] }).catch(() => null);
      if (sent) await ticketEngine.setLastLifecycleMessageId(ticket.id, sent.id);
    }
    if (!isButton) await interaction.editReply({ content: '🔒 Ticket closed.' }).catch(() => {});

    // Review System: non-blocking DM to opener after close
    if (this.client) {
      reviewEngine.sendReviewDM(this.client, ticket, rawPanel).catch(err =>
        logger.warning('[REVIEW] Failed to send review DM', err),
      );
    }
  }

  private async reopenTicket(interaction: ButtonInteraction | ChatInputCommandInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (!ticket) {
      await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
      return;
    }
    if (ticket.status !== 'closed') {
      await interaction.reply({ content: '❌ This ticket is not closed.', ephemeral: true });
      return;
    }
    const rawPanel = await panelManager.get(ticket.panelId);
    if (!rawPanel) {
      await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
      return;
    }
    const cfg = resolveTicketType(rawPanel, ticket.ticketType);
    const isButton = interaction instanceof ButtonInteraction;
    // Same reasoning as closeTicket: never edit the message the interaction came from — the
    // Reopen button lives on the previous "Ticket Closed" message, which we handle explicitly
    // below (disable its controls), not via deferUpdate()/editReply().
    if (isButton) await interaction.deferUpdate();
    else await interaction.deferReply({ ephemeral: true });
    await ticketEngine.reopen(guild, cfg, ticket, interaction.user.id);

    // The one allowed edit to an old lifecycle message: disable its now-obsolete controls
    // (Reopen/Delete/Transcript) so they can't be used again. The header is never touched.
    if (ticket.lastLifecycleMessageId) {
      await this.disableLifecycleMessageControls(guild, ticket.channelId, ticket.lastLifecycleMessageId);
    }

    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const sent = await (channel as TextChannel).send({ content: `🔓 Ticket reopened by ${interaction.user}.` }).catch(() => null);
      await ticketEngine.setLastLifecycleMessageId(ticket.id, sent?.id);
    }
    if (!isButton) await interaction.editReply({ content: '🔓 Ticket reopened.' }).catch(() => {});
  }

  /**
   * Disables every button on a previous close/reopen lifecycle message (e.g. the Reopen/Delete/
   * Transcript row on a now-superseded "Ticket Closed" message) without deleting it or changing
   * anything else about it. Callers must only ever pass a tracked lifecycle message ID here —
   * never the permanent header's ID.
   */
  private async disableLifecycleMessageControls(guild: Guild, channelId: string, messageId: string): Promise<void> {
    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) return;
      const message = await (channel as TextChannel).messages.fetch(messageId).catch(() => null);
      if (!message || message.components.length === 0) return;
      const rows = message.components
        .filter((row): row is ActionRow<MessageActionRowComponent> => row.type === ComponentType.ActionRow)
        .map(row => new ActionRowBuilder<ButtonBuilder>().addComponents(
          row.components.map(c => ButtonBuilder.from(c as ButtonComponent).setDisabled(true)),
        ));
      await message.edit({ components: rows });
    } catch (err) {
      logger.warning('[TICKETS] Failed to disable previous lifecycle message controls', err);
    }
  }

  private async deleteTicketChannel(interaction: ButtonInteraction | ChatInputCommandInteraction, guild: Guild, ticketId: string): Promise<void> {
    const ticket = await ticketEngine.getById(ticketId);
    if (ticket && ticket.status !== 'closed') {
      await interaction.reply({ content: '❌ Close this ticket before deleting it.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: '🗑️ Deleting ticket channel in 5 seconds...' });
    setTimeout(async () => {
      const channel = await guild.channels.fetch(interaction.channelId).catch(() => null);
      await channel?.delete().catch(() => {});
    }, 5000);
    if (ticket) await ticketEngine.delete(ticket, interaction.user.id);
  }

  private async sendTranscript(interaction: ButtonInteraction | ChatInputCommandInteraction, guild: Guild, ticketId: string): Promise<void> {
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

  /**
   * `/ticket` slash command — the full staff control surface: claim, unclaim, lock,
   * unlock, rename, add, remove, priority, transcript, close, reopen, delete (plus the
   * bonus read-only `info`). Only works inside an active ticket channel, and every
   * subcommand calls the exact same engine methods (and, where the equivalent `tk:*`
   * button already exists, the exact same handler) as the buttons — no business logic
   * is duplicated here. Staff-only subcommands are gated with `isStaffMember`; `unclaim`
   * and `transcript` deliberately mirror their buttons' lack of a gate for `unclaim`'s
   * unclaim-half (see `claim()`), while `transcript` is gated here since it's listed
   * under Staff Controls even though its legacy button predates that distinction.
   */
  async handleSlashCommand(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    try {
      const ticket = await ticketEngine.getByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: '❌ This command can only be used inside a ticket channel.', ephemeral: true });
        return;
      }
      const rawPanel = await panelManager.get(ticket.panelId);
      if (!rawPanel) {
        await interaction.reply({ content: '❌ This ticket panel no longer exists.', ephemeral: true });
        return;
      }
      const cfg = resolveTicketType(rawPanel, ticket.ticketType);
      const member = interaction.member instanceof GuildMember ? interaction.member : null;
      const sub = interaction.options.getSubcommand(true);

      // Every subcommand below is a "Staff Control" per the spec — gate them all here
      // except `info` (read-only) and `unclaim` (mirrors the ungated button; see `claim()`).
      if (sub !== 'info' && sub !== 'unclaim' && !this.isStaffMember(cfg, member)) {
        await interaction.reply({ content: '❌ You are not allowed to manage this ticket.', ephemeral: true });
        return;
      }

      switch (sub) {
        case 'add':
          await this.slashAddUser(interaction, guild, cfg, ticket, member);
          break;
        case 'remove':
          await this.slashRemoveUser(interaction, guild, cfg, ticket, member);
          break;
        case 'rename':
          await this.slashRenameTicket(interaction, guild, cfg, ticket, member);
          break;
        case 'claim':
          await this.claim(interaction, guild, ticket.id, true);
          break;
        case 'unclaim':
          await this.claim(interaction, guild, ticket.id, false);
          break;
        case 'lock':
          await this.slashLock(interaction, guild, cfg, ticket);
          break;
        case 'unlock':
          await this.slashUnlock(interaction, guild, cfg, ticket);
          break;
        case 'priority':
          await this.slashSetPriority(interaction, guild, cfg, ticket, member);
          break;
        case 'transcript':
          await this.sendTranscript(interaction, guild, ticket.id);
          break;
        case 'close':
          await this.closeTicket(interaction, guild, ticket.id);
          break;
        case 'reopen':
          await this.reopenTicket(interaction, guild, ticket.id);
          break;
        case 'delete':
          await this.deleteTicketChannel(interaction, guild, ticket.id);
          break;
        case 'info':
          await this.slashTicketInfo(interaction, rawPanel, ticket);
          break;
        default:
          await interaction.reply({ content: '❌ Unknown /ticket subcommand.', ephemeral: true });
      }
    } catch (err) {
      logger.error('[TICKETS] /ticket command error', err);
      await this.replyError(interaction);
    }
  }

  private async slashAddUser(interaction: ChatInputCommandInteraction, guild: Guild, cfg: TicketPanel, ticket: TicketRecord, member: GuildMember | null): Promise<void> {
    if (!this.isStaffMember(cfg, member)) {
      await interaction.reply({ content: '❌ You are not allowed to add users to this ticket.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('user', true);
    if (user.id === ticket.openerId || ticket.participantIds.includes(user.id)) {
      await interaction.reply({ content: `❌ ${user} already has access to this ticket.`, ephemeral: true });
      return;
    }
    await ticketEngine.addParticipant(guild, cfg, ticket, user.id, interaction.user.tag);
    await interaction.reply({ content: `➕ ${interaction.user} added ${user} to this ticket.` });
  }

  private async slashRemoveUser(interaction: ChatInputCommandInteraction, guild: Guild, cfg: TicketPanel, ticket: TicketRecord, member: GuildMember | null): Promise<void> {
    if (!this.isStaffMember(cfg, member)) {
      await interaction.reply({ content: '❌ You are not allowed to remove users from this ticket.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('user', true);
    if (user.id === ticket.openerId) {
      await interaction.reply({ content: '❌ You cannot remove the ticket opener. Close the ticket instead.', ephemeral: true });
      return;
    }
    if (!ticket.participantIds.includes(user.id)) {
      await interaction.reply({ content: `❌ ${user} is not part of this ticket.`, ephemeral: true });
      return;
    }
    await ticketEngine.removeParticipant(guild, cfg, ticket, user.id, interaction.user.tag);
    await interaction.reply({ content: `➖ ${interaction.user} removed ${user} from this ticket.` });
  }

  private async slashRenameTicket(interaction: ChatInputCommandInteraction, guild: Guild, cfg: TicketPanel, ticket: TicketRecord, member: GuildMember | null): Promise<void> {
    if (!this.isStaffMember(cfg, member)) {
      await interaction.reply({ content: '❌ You are not allowed to rename this ticket.', ephemeral: true });
      return;
    }
    const name = interaction.options.getString('name', true);
    try {
      const sanitized = await ticketEngine.renameTicket(guild, cfg, ticket, name, interaction.user.tag);
      await interaction.reply({ content: `✏️ ${interaction.user} renamed this ticket to **${sanitized}**.` });
    } catch (err) {
      logger.warning('[TICKETS] /ticket rename failed', err);
      await interaction.reply({ content: '❌ Failed to rename this ticket (Discord may be rate-limiting channel renames — try again shortly).', ephemeral: true });
    }
  }

  private async slashLock(interaction: ChatInputCommandInteraction, guild: Guild, cfg: TicketPanel, ticket: TicketRecord): Promise<void> {
    if (ticket.status !== 'open') {
      await interaction.reply({ content: `❌ This ticket is not open (current status: ${ticket.status}).`, ephemeral: true });
      return;
    }
    await ticketEngine.lock(guild, cfg, ticket, interaction.user.tag);
    await interaction.reply({ content: `🔒 ${interaction.user} locked this ticket — only staff can send messages until it's unlocked.` });
  }

  private async slashUnlock(interaction: ChatInputCommandInteraction, guild: Guild, cfg: TicketPanel, ticket: TicketRecord): Promise<void> {
    if (ticket.status !== 'locked') {
      await interaction.reply({ content: `❌ This ticket is not locked (current status: ${ticket.status}).`, ephemeral: true });
      return;
    }
    await ticketEngine.unlock(guild, cfg, ticket, interaction.user.tag);
    await interaction.reply({ content: `🔓 ${interaction.user} unlocked this ticket.` });
  }

  private async slashSetPriority(interaction: ChatInputCommandInteraction, guild: Guild, cfg: TicketPanel, ticket: TicketRecord, member: GuildMember | null): Promise<void> {
    if (!this.isStaffMember(cfg, member)) {
      await interaction.reply({ content: '❌ You are not allowed to change this ticket\'s priority.', ephemeral: true });
      return;
    }
    const level = interaction.options.getString('level', true) as TicketPriority;
    await ticketEngine.setPriority(guild, cfg, ticket, level, interaction.user.tag);
    await interaction.reply({ content: `🎯 ${interaction.user} set this ticket's priority to **${level}**.` });
  }

  private async slashTicketInfo(interaction: ChatInputCommandInteraction, panel: TicketPanel, ticket: TicketRecord): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(panel.embed.color)
      .setTitle(`🎫 Ticket #${ticket.number}`)
      .addFields(
        { name: 'Type', value: ticket.ticketType, inline: true },
        { name: 'Status', value: ticket.status, inline: true },
        { name: 'Priority', value: ticket.priority, inline: true },
        { name: 'Opened by', value: `<@${ticket.openerId}>`, inline: true },
        { name: 'Claimed by', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '_Unclaimed_', inline: true },
        { name: 'Participants', value: ticket.participantIds.length > 0 ? ticket.participantIds.map(id => `<@${id}>`).join(', ') : '_None added_', inline: false },
        { name: 'Opened', value: `<t:${Math.floor(ticket.createdAt / 1000)}:R>`, inline: true },
        { name: 'Last activity', value: `<t:${Math.floor(ticket.lastActivityAt / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `Ticket ID: ${ticket.id} • Panel: ${panel.name}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Review System Pro ─────────────────────────────────────────────────────
  //
  // These handlers run in DM context (no guild), so they are NOT gated by
  // `interaction.guild`. They must be routed BEFORE the generic `tk:*` block
  // in ai.service.ts which silently drops non-guild interactions.

  /**
   * Handles `tk:review:rate:<ticketId>:<rating>` button clicks (in DMs).
   * Validates ownership + dedup, then shows the comment modal.
   */
  async handleReviewInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      const parts = interaction.customId.split(':');
      const ticketId = parts[3];
      const rating = parseInt(parts[4], 10) as 1 | 2 | 3 | 4 | 5;

      if (rating < 1 || rating > 5) {
        await interaction.reply({ content: '❌ Invalid rating.', ephemeral: true });
        return;
      }

      const ticket = await ticketEngine.getById(ticketId);
      if (!ticket) {
        await interaction.reply({ content: '❌ This ticket no longer exists.', ephemeral: true });
        return;
      }
      if (ticket.openerId !== interaction.user.id) {
        await interaction.reply({ content: '❌ Only the ticket opener can submit a review.', ephemeral: true });
        return;
      }
      if (await reviewEngine.hasReviewed(ticketId, interaction.user.id)) {
        await interaction.reply({ content: '❌ You have already submitted a review for this ticket.', ephemeral: true });
        return;
      }

      const rawPanel = await panelManager.get(ticket.panelId);
      const cfg = rawPanel ? { ...DEFAULT_REVIEW_CONFIG, ...(rawPanel.reviewConfig ?? {}) } : DEFAULT_REVIEW_CONFIG;

      // Store rating in memory between button click and modal submit
      const pendingKey = `${ticketId}:${interaction.user.id}`;
      this.pendingReviews.set(pendingKey, rating);

      // Encode the DM message location in the modal customId so we can edit it after submit
      const messageId  = interaction.message.id;
      const channelId  = interaction.channelId;

      const modal = new ModalBuilder()
        .setCustomId(`tk:review:modal:${ticketId}:${channelId}:${messageId}`)
        .setTitle(`You rated: ${STAR_LABELS[rating - 1]}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel(cfg.requireComment ? 'Your comment (required)' : 'Leave a comment (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Tell us about your experience…')
              .setRequired(cfg.requireComment)
              .setMaxLength(1000),
          ),
        );

      await interaction.showModal(modal);
    } catch (err) {
      logger.error('[REVIEW] handleReviewInteraction error', err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ An error occurred processing your rating.', ephemeral: true });
        }
      } catch { /* ignore double-reply errors */ }
    }
  }

  /**
   * Handles `tk:review:modal:<ticketId>:<channelId>:<messageId>` modal submits (in DMs).
   * Records the review, disables the star buttons, and posts the log embed.
   */
  async handleReviewModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      const parts     = interaction.customId.split(':');
      const ticketId  = parts[3];
      const channelId = parts[4];
      const messageId = parts[5];

      const pendingKey = `${ticketId}:${interaction.user.id}`;
      const rating     = this.pendingReviews.get(pendingKey);
      this.pendingReviews.delete(pendingKey);

      if (!rating) {
        await interaction.reply({ content: '❌ Your rating session expired — please click a star again.', ephemeral: true });
        return;
      }

      // Race-condition guard: check again after acquiring rating
      if (await reviewEngine.hasReviewed(ticketId, interaction.user.id)) {
        await interaction.reply({ content: '❌ You have already submitted a review for this ticket.', ephemeral: true });
        return;
      }

      const ticket = await ticketEngine.getById(ticketId);
      if (!ticket) {
        await interaction.reply({ content: '❌ This ticket no longer exists.', ephemeral: true });
        return;
      }

      let comment: string | undefined;
      try {
        const raw = interaction.fields.getTextInputValue('comment').trim();
        if (raw) comment = raw;
      } catch { /* field absent is fine — optional */ }

      const rawPanel = await panelManager.get(ticket.panelId);
      const cfg      = rawPanel ? { ...DEFAULT_REVIEW_CONFIG, ...(rawPanel.reviewConfig ?? {}) } : DEFAULT_REVIEW_CONFIG;

      const review = reviewEngine.buildRecord({
        ticket,
        openerId:  interaction.user.id,
        rating:    rating as 1 | 2 | 3 | 4 | 5,
        comment,
        anonymous: cfg.anonymousReviews,
      });
      await reviewEngine.save(review);

      // Acknowledge the modal to the user
      await interaction.reply({ content: `✅ Thank you for your feedback! You rated: **${STAR_LABELS[rating - 1]}**`, ephemeral: true });

      // Edit the original DM message: disable all star buttons + swap embed to a "thanks" state
      try {
        const ch  = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (ch?.isTextBased()) {
          const msg = await (ch as TextBasedChannel).messages.fetch(messageId).catch(() => null);
          if (msg) {
            const thanksEmbed = new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle('✅ Review Submitted')
              .setDescription(`Thank you for your feedback!\n\nYou rated ticket **#${ticket.number}**: **${STAR_LABELS[rating - 1]}**`)
              .setTimestamp();
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              ...[1, 2, 3, 4, 5].map(n =>
                new ButtonBuilder()
                  .setCustomId(`tk:review:rate:${ticketId}:${n}`)
                  .setLabel(STAR_LABELS[n - 1])
                  .setStyle(n === rating ? ButtonStyle.Success : ButtonStyle.Secondary)
                  .setDisabled(true),
              ),
            );
            await msg.edit({ embeds: [thanksEmbed], components: [disabledRow] });
          }
        }
      } catch (editErr) {
        logger.warning('[REVIEW] Could not edit DM message after review submit', editErr);
      }

      // Post to log channel (non-blocking)
      if (cfg.logChannelId && this.client) {
        this.postReviewLog(review, cfg).catch(err =>
          logger.warning('[REVIEW] Failed to post review log', err),
        );
      }
    } catch (err) {
      logger.error('[REVIEW] handleReviewModal error', err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ An error occurred saving your review.', ephemeral: true });
        }
      } catch { /* ignore */ }
    }
  }

  /** Posts the review log embed to the configured log channel. */
  private async postReviewLog(review: TicketReviewRecord, cfg: ReviewConfig): Promise<void> {
    if (!this.client || !cfg.logChannelId) return;
    const guild = await this.client.guilds.fetch(review.guildId).catch(() => null);
    if (!guild) return;
    const ch = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!ch?.isTextBased()) return;

    const fmtMs = (ms?: number): string => {
      if (!ms || ms <= 0) return '_N/A_';
      const secs = Math.round(ms / 1000);
      if (secs < 60) return `${secs}s`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ${secs % 60}s`;
      const hours = Math.floor(mins / 60);
      return `${hours}h ${mins % 60}m`;
    };

    const ratingColor = review.rating >= 4 ? 0x57f287 : review.rating >= 3 ? 0xfee75c : 0xed4245;

    const embed = new EmbedBuilder()
      .setColor(ratingColor)
      .setTitle(`⭐ New Review — Ticket #${review.ticketNumber}`)
      .addFields(
        { name: '👤 User',              value: review.anonymous ? '_Anonymous_' : `<@${review.openerId}>`,       inline: true },
        { name: '🎫 Ticket',            value: `#${review.ticketNumber}`,                                        inline: true },
        { name: '🏷️ Ticket Type',       value: review.ticketType,                                                inline: true },
        { name: '⭐ Rating',            value: STAR_LABELS[review.rating - 1],                                   inline: true },
        { name: '🙋 Claimed By',        value: review.claimedBy ? `<@${review.claimedBy}>` : '_Unclaimed_',     inline: true },
        { name: '🔒 Closed By',         value: review.closedBy  ? `<@${review.closedBy}>` : '_Unknown_',        inline: true },
        { name: '⏱ Response Time',      value: fmtMs(review.responseTimeMs),                                     inline: true },
        { name: '✅ Resolution Time',    value: fmtMs(review.resolutionTimeMs),                                   inline: true },
        { name: '📅 Review Submitted',   value: `<t:${Math.floor(review.reviewedAt / 1000)}:R>`,                 inline: true },
      )
      .setTimestamp(review.reviewedAt)
      .setFooter({ text: `Ticket ID: ${review.ticketId} · Panel ID: ${review.panelId}` });

    if (review.comment) {
      embed.addFields({ name: '💬 Comment', value: review.comment.slice(0, 1024), inline: false });
    }

    await (ch as TextChannel).send({ embeds: [embed] });
    logger.info(`[REVIEW] Posted log for ticket #${review.ticketNumber} (rating ${review.rating}★)`);
  }

  private async replyError(interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction): Promise<void> {
    const payload = { content: '❌ An error occurred processing this ticket action.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }

  /** Convenience used by AI tools: gate + resolve name/permission checks are handled inside. */
  canOpen = permissionEngine.canOpen.bind(permissionEngine);
}

export const ticketSystem = new TicketSystem();
