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
import type { TicketPanel, TicketRecord } from './types';
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

  private async logAction(guild: Guild, panel: TicketPanel, message: string): Promise<void> {
    if (!panel.logChannelId) return;
    const ch = await guild.channels.fetch(panel.logChannelId).catch(() => null);
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

  async getOpenForUser(guildId: string, userId: string, panelId?: string): Promise<TicketRecord[]> {
    const data = await store.read();
    return data.tickets.filter(t => t.guildId === guildId && t.openerId === userId && t.status === 'open' && (!panelId || t.panelId === panelId));
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

  /** Preflight checks before showing a modal or creating a channel. */
  async checkCanOpen(panel: TicketPanel, member: GuildMember | null, userId: string): Promise<string | null> {
    if (!panel.enabled) return 'This ticket panel is currently disabled.';

    const permissionBlock = permissionEngine.canOpen(panel, member, userId);
    if (permissionBlock) return permissionBlock;

    const openCount = (await this.getOpenForUser(panel.guildId, userId)).length;
    if (openCount >= panel.ticketLimit) return `You already have ${openCount} open ticket(s) (limit: ${panel.ticketLimit}).`;

    const cooldownRemaining = await automationEngine.remainingCooldownSeconds(panel, userId);
    if (cooldownRemaining > 0) return `Please wait ${cooldownRemaining}s before opening another ticket on this panel.`;

    return null;
  }

  async createChannel(
    guild: Guild,
    panel: TicketPanel,
    opener: { id: string; username: string; displayName: string; tag: string },
    ticketType: string,
    answers: Record<string, string>,
    extraAnswerFields: { name: string; value: string }[] = [],
  ): Promise<{ ticket: TicketRecord; channel: TextChannel }> {
    const number = await this.nextNumber(guild.id);
    const ticketId = genId('ticket');
    const name = namingEngine.render(panel.namingScheme, {
      userId: opener.id,
      username: opener.username,
      displayName: opener.displayName,
      ticketId,
      counter: number,
      ticketType,
      now: new Date(),
    });

    const overwrites = permissionEngine.buildOverwrites(guild, panel, opener.id);
    const channel = (await guild.channels.create({
      name,
      parent: panel.openCategory,
      permissionOverwrites: overwrites,
      topic: `Ticket for ${opener.tag} • Type: ${ticketType} • Panel: ${panel.id}`,
    })) as TextChannel;

    const ticket: TicketRecord = {
      id: ticketId,
      guildId: guild.id,
      panelId: panel.id,
      ticketType,
      channelId: channel.id,
      openerId: opener.id,
      status: 'open',
      number,
      priority: panel.priority,
      answers,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      participantIds: [opener.id],
    };

    await store.mutate(data => {
      data.tickets.push(ticket);
    });

    await automationEngine.touchActivity(ticket.id, channel.id);
    if (panel.statistics.trackClaims || panel.statistics.trackResponseTime) {
      await statisticsEngine.record({ type: 'opened', guildId: guild.id, panelId: panel.id, ticketId: ticket.id, userId: opener.id });
    }

    const embed = new EmbedBuilder()
      .setColor(panel.embed.color)
      .setTitle(`🎫 ${ticketType} — Ticket #${number}`)
      .setDescription(`Welcome <@${opener.id}>, support will be with you shortly.\n\nUse the buttons below to manage this ticket.`)
      .setFooter({ text: `Ticket ID: ${ticket.id} • Priority: ${panel.priority}` });

    if (panel.modal.enabled && Object.keys(answers).length > 0) {
      embed.addFields(questionEngine.formatAnswersForEmbed(panel.modal, answers));
    }
    if (extraAnswerFields.length > 0) {
      embed.addFields(extraAnswerFields.slice(0, 25));
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tk:claim:${ticket.id}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
      new ButtonBuilder().setCustomId(`tk:close:${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId(`tk:transcript:${ticket.id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );

    const pingRoles = panel.pingRoles.map(id => `<@&${id}>`).join(' ');
    await channel.send({ content: pingRoles || undefined, embeds: [embed], components: [row] });

    await this.logAction(guild, panel, `🎫 Ticket **#${number}** opened by ${opener.tag} in ${channel} (type: ${ticketType})`);

    return { ticket, channel };
  }

  async claim(_guild: Guild, ticketId: string, userId: string, claim: boolean): Promise<TicketRecord | undefined> {
    const ticket = await this.getById(ticketId);
    if (!ticket) return undefined;
    const firstReply = ticket.firstStaffReplyAt ?? (claim ? Date.now() : undefined);
    const updated = await this.update(ticketId, { claimedBy: claim ? userId : undefined, firstStaffReplyAt: firstReply });
    if (claim) {
      await statisticsEngine.record({
        type: 'claimed',
        guildId: ticket.guildId,
        panelId: ticket.panelId,
        ticketId: ticket.id,
        userId,
        responseMs: ticket.firstStaffReplyAt ? undefined : Date.now() - ticket.createdAt,
      });
    } else {
      await statisticsEngine.record({ type: 'unclaimed', guildId: ticket.guildId, panelId: ticket.panelId, ticketId: ticket.id, userId });
    }
    await automationEngine.touchActivity(ticketId, ticket.channelId);
    return updated;
  }

  async close(guild: Guild, panel: TicketPanel, ticket: TicketRecord, closedByUserId: string, closedByTag: string): Promise<void> {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);

    if (channel?.isTextBased()) {
      await transcriptEngine.deliver(guild, panel, ticket, closedByTag);
      await permissionEngine.lockForClose(channel as TextChannel, ticket.openerId);
      if (panel.closedCategory) await categoryEngine.moveToClosed(channel as TextChannel, panel);
      else if (panel.archiveCategory) await categoryEngine.moveToArchive(channel as TextChannel, panel);
    }

    await this.update(ticket.id, { status: 'closed', closedAt: Date.now(), closedBy: closedByUserId });
    await automationEngine.recordClose(panel, ticket.openerId);
    await automationEngine.clearActivity(ticket.id);
    await statisticsEngine.record({ type: 'closed', guildId: guild.id, panelId: panel.id, ticketId: ticket.id, userId: closedByUserId });
    await this.logAction(guild, panel, `🔒 Ticket **#${ticket.number}** closed by ${closedByTag}`);

    if (panel.automation.autoDeleteAfterCloseMinutes > 0 && channel) {
      setTimeout(() => {
        channel.delete().catch(err => logger.warning(`[TICKETS] Auto-delete failed for ${channel.id}`, err));
      }, panel.automation.autoDeleteAfterCloseMinutes * 60_000);
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
