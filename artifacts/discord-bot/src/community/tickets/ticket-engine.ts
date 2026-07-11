// ─────────────────────────────────────────────────────────────────────────────
// TicketEngine — creates, opens, closes, deletes, and reopens live tickets.
// Owns data/tickets/records.json exclusively (ticket instances + per-guild
// counters). This file is not one of the six explicitly named in the spec's
// storage list, but a ticket engine cannot function without persisting the
// tickets it creates — see Phase 1 summary for the rationale.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { JsonStore, genId } from './store';
import type { TicketPanel, TicketRecord, ResolvedTicketConfig } from './types';
import { namingEngine } from './naming-engine';
import { permissionEngine } from './permission-engine';
import { categoryEngine } from './category-engine';
import { questionEngine } from './question-engine';
import { transcriptEngine } from './transcript-engine';
import { automationEngine } from './automation-engine';
import { statisticsEngine } from './statistics-engine';
import { logger } from '../../utils/logger';

interface RecordData {
  tickets: TicketRecord[];
  counters: Record<string, number>;
}

const store = new JsonStore<RecordData>('records.json', () => ({ tickets: [], counters: {} }));

export interface OpenTicketResult {
  ok: boolean;
  reason?: string;
  ticket?: TicketRecord;
  channel?: TextChannel;
}

export class TicketEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  /** `cfg` should be the ticket-type-resolved config (see `resolveTicketType`) so `cfg.logChannelId` reflects this ticket type. */
  private async logAction(guild: Guild, cfg: TicketPanel, message: string): Promise<void> {
    if (!cfg.logChannelId) return;
    const ch = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send(message).catch(() => {});
  }

  private async nextNumber(guildId: string): Promise<number> {
    return store.mutate(data => {
      data.counters[guildId] = (data.counters[guildId] ?? 0) + 1;
      return data.counters[guildId];
    });
  }

  async getById(ticketId: string): Promise<TicketRecord | undefined> {
    const data = await store.read();
    return data.tickets.find(t => t.id === ticketId);
  }

  async getByChannel(channelId: string): Promise<TicketRecord | undefined> {
    const data = await store.read();
    return data.tickets.find(t => t.channelId === channelId);
  }

  async getOpenForUser(guildId: string, userId: string, panelId?: string, ticketType?: string): Promise<TicketRecord[]> {
    const data = await store.read();
    return data.tickets.filter(t =>
      t.guildId === guildId &&
      t.openerId === userId &&
      t.status === 'open' &&
      (!panelId || t.panelId === panelId) &&
      (!ticketType || t.ticketType === ticketType),
    );
  }

  async listForGuild(guildId: string): Promise<TicketRecord[]> {
    const data = await store.read();
    return data.tickets.filter(t => t.guildId === guildId);
  }

  private async update(ticketId: string, patch: Partial<TicketRecord>): Promise<TicketRecord | undefined> {
    return store.mutate(data => {
      const ticket = data.tickets.find(t => t.id === ticketId);
      if (!ticket) return undefined;
      Object.assign(ticket, patch);
      return ticket;
    });
  }

  /**
   * Preflight checks before showing a modal or creating a channel.
   * `cfg` must be the ticket-type-resolved config (see `resolveTicketType`)
   * so ticket limit / cooldown reflect that type's own settings; `ticketType`
   * scopes the open-ticket count and cooldown clock to that specific type.
   */
  async checkCanOpen(cfg: TicketPanel, member: GuildMember | null, userId: string, ticketType: string): Promise<string | null> {
    if (!cfg.enabled) return 'This ticket panel is currently disabled.';

    const permissionBlock = permissionEngine.canOpen(cfg, member, userId);
    if (permissionBlock) return permissionBlock;

    const openCount = (await this.getOpenForUser(cfg.guildId, userId, cfg.id, ticketType)).length;
    if (openCount >= cfg.ticketLimit) return `You already have ${openCount} open ticket(s) of this type (limit: ${cfg.ticketLimit}).`;

    const cooldownRemaining = await automationEngine.remainingCooldownSeconds(cfg, userId, ticketType);
    if (cooldownRemaining > 0) return `Please wait ${cooldownRemaining}s before opening another ticket of this type.`;

    return null;
  }

  /** `cfg` must be the ticket-type-resolved config (see `resolveTicketType`) so every setting below reflects this specific ticket type. */
  async createChannel(
    guild: Guild,
    cfg: TicketPanel | ResolvedTicketConfig,
    opener: { id: string; username: string; displayName: string; tag: string },
    ticketType: string,
    answers: Record<string, string>,
    extraAnswerFields: { name: string; value: string }[] = [],
  ): Promise<{ ticket: TicketRecord; channel: TextChannel }> {
    const number = await this.nextNumber(guild.id);
    const ticketId = genId('ticket');
    const name = namingEngine.render(cfg.namingScheme, {
      userId: opener.id,
      username: opener.username,
      displayName: opener.displayName,
      ticketId,
      counter: number,
      ticketType,
      now: new Date(),
    });

    const overwrites = permissionEngine.buildOverwrites(guild, cfg, opener.id);
    const channel = (await guild.channels.create({
      name,
      parent: cfg.openCategory,
      permissionOverwrites: overwrites,
      topic: `Ticket for ${opener.tag} • Type: ${ticketType} • Panel: ${cfg.id}`,
    })) as TextChannel;

    const ticket: TicketRecord = {
      id: ticketId,
      guildId: guild.id,
      panelId: cfg.id,
      ticketType,
      channelId: channel.id,
      openerId: opener.id,
      status: 'open',
      number,
      priority: cfg.priority,
      answers,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      participantIds: [opener.id],
    };

    await store.mutate(data => {
      data.tickets.push(ticket);
    });

    await automationEngine.touchActivity(ticket.id, channel.id);
    if (cfg.statistics.trackClaims || cfg.statistics.trackResponseTime) {
      await statisticsEngine.record({ type: 'opened', guildId: guild.id, panelId: cfg.id, ticketId: ticket.id, userId: opener.id });
    }

    const embedOverride = (cfg as ResolvedTicketConfig).ticketEmbedOverride;
    const embed = new EmbedBuilder()
      .setColor(embedOverride?.color ?? cfg.embed.color)
      .setTitle(embedOverride?.title || `🎫 ${ticketType} — Ticket #${number}`)
      .setDescription(embedOverride?.description || `Welcome <@${opener.id}>, support will be with you shortly.\n\nUse the buttons below to manage this ticket.`)
      .setFooter({ text: embedOverride?.footer || `Ticket ID: ${ticket.id} • Priority: ${cfg.priority}` });
    if (embedOverride?.thumbnail) embed.setThumbnail(embedOverride.thumbnail);
    if (embedOverride?.banner) embed.setImage(embedOverride.banner);
    if (embedOverride?.author) embed.setAuthor({ name: embedOverride.author });
    if (embedOverride?.showTimestamp) embed.setTimestamp();

    if (cfg.modal.enabled && Object.keys(answers).length > 0) {
      embed.addFields(questionEngine.formatAnswersForEmbed(cfg.modal, answers));
    }
    if (extraAnswerFields.length > 0) {
      embed.addFields(extraAnswerFields.slice(0, 25));
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk:claim:${ticket.id}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
      new ButtonBuilder().setCustomId(`tk:close:${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId(`tk:transcript:${ticket.id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );

    const pingRoles = cfg.pingRoles.map(id => `<@&${id}>`).join(' ');
    await channel.send({ content: pingRoles || undefined, embeds: [embed], components: [row] });

    await this.logAction(guild, cfg, `🎫 Ticket **#${number}** opened by ${opener.tag} in ${channel} (type: ${ticketType})`);

    return { ticket, channel };
  }

  /**
   * `cfg` must be the ticket-type-resolved config (see `resolveTicketType`) so `cfg.claimBehaviour`
   * enforces this ticket type's own hide/override rules. `claimerRoleIds` are the claiming staff
   * member's Discord role ids, kept visible even when `hideFromOtherStaffOnClaim` is on.
   */
  async claim(guild: Guild, cfg: TicketPanel, ticketId: string, userId: string, claim: boolean, claimerRoleIds: string[] = []): Promise<TicketRecord | undefined> {
    const ticket = await this.getById(ticketId);
    if (!ticket) return undefined;
    const firstReply = ticket.firstStaffReplyAt ?? (claim ? Date.now() : undefined);
    const updated = await this.update(ticketId, { claimedBy: claim ? userId : undefined, firstStaffReplyAt: firstReply });

    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (claim) {
      await statisticsEngine.record({
        type: 'claimed',
        guildId: ticket.guildId,
        panelId: ticket.panelId,
        ticketId: ticket.id,
        userId,
        responseMs: ticket.firstStaffReplyAt ? undefined : Date.now() - ticket.createdAt,
      });
      if (channel?.isTextBased() && cfg.claimBehaviour.hideFromOtherStaffOnClaim && !cfg.claimBehaviour.keepVisible) {
        await permissionEngine.hideFromOtherStaff(channel as TextChannel, cfg, claimerRoleIds);
      }
    } else {
      await statisticsEngine.record({ type: 'unclaimed', guildId: ticket.guildId, panelId: ticket.panelId, ticketId: ticket.id, userId });
      if (channel?.isTextBased()) {
        await permissionEngine.restoreStaffAccess(channel as TextChannel, guild, cfg, ticket.openerId);
      }
    }
    await automationEngine.touchActivity(ticketId, ticket.channelId);
    return updated;
  }

  /** `cfg` must be the ticket-type-resolved config (see `resolveTicketType`) so every setting below reflects this specific ticket type. */
  async close(guild: Guild, cfg: TicketPanel, ticket: TicketRecord, closedByUserId: string, closedByTag: string): Promise<void> {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);

    if (channel?.isTextBased()) {
      await transcriptEngine.deliver(guild, cfg, ticket, closedByTag);
      await permissionEngine.lockForClose(channel as TextChannel, ticket.openerId);
      if (cfg.closedCategory) await categoryEngine.moveToClosed(channel as TextChannel, cfg);
      else if (cfg.archiveCategory) await categoryEngine.moveToArchive(channel as TextChannel, cfg);
    }

    await this.update(ticket.id, { status: 'closed', closedAt: Date.now(), closedBy: closedByUserId });
    await automationEngine.recordClose(cfg, ticket.openerId, ticket.ticketType);
    await automationEngine.clearActivity(ticket.id);
    await statisticsEngine.record({ type: 'closed', guildId: guild.id, panelId: cfg.id, ticketId: ticket.id, userId: closedByUserId });
    await this.logAction(guild, cfg, `🔒 Ticket **#${ticket.number}** closed by ${closedByTag}`);

    if (cfg.automation.autoDeleteAfterCloseMinutes > 0 && channel) {
      setTimeout(() => {
        channel.delete().catch(err => logger.warning(`[TICKETS] Auto-delete failed for ${channel.id}`, err));
      }, cfg.automation.autoDeleteAfterCloseMinutes * 60_000);
    }
  }

  async reopen(guild: Guild, ticket: TicketRecord, reopenedByUserId: string): Promise<void> {
    await this.update(ticket.id, { status: 'open', closedAt: undefined, closedBy: undefined, lastActivityAt: Date.now() });
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased()) await permissionEngine.unlockForReopen(channel as TextChannel, ticket.openerId);
    await automationEngine.touchActivity(ticket.id, ticket.channelId);
    await statisticsEngine.record({ type: 'reopened', guildId: guild.id, panelId: ticket.panelId, ticketId: ticket.id, userId: reopenedByUserId });
  }

  async delete(ticket: TicketRecord, deletedByUserId: string): Promise<void> {
    await statisticsEngine.record({ type: 'deleted', guildId: ticket.guildId, panelId: ticket.panelId, ticketId: ticket.id, userId: deletedByUserId });
    await automationEngine.clearActivity(ticket.id);
  }

  async dashboardStats(guildId: string) {
    return statisticsEngine.getDashboard(guildId);
  }

  /** Direct import for the migration runner only — preserves legacy IDs, timestamps and counters. */
  async importRaw(tickets: TicketRecord[], counters: Record<string, number>): Promise<void> {
    await store.mutate(data => {
      for (const ticket of tickets) {
        if (!data.tickets.some(t => t.id === ticket.id)) data.tickets.push(ticket);
      }
      for (const [guildId, count] of Object.entries(counters)) {
        data.counters[guildId] = Math.max(data.counters[guildId] ?? 0, count);
      }
    });
  }
}

export const ticketEngine = new TicketEngine();
