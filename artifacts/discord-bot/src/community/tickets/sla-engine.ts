// ─────────────────────────────────────────────────────────────────────────────
// SLAEngine — tracks SLA per ticket type, fires warning/critical/breach
// notifications, and computes compliance dashboards. Owns data/tickets/sla.json
// exclusively. Other engines report SLA events through onTicketCreated(),
// onFirstResponse(), and onResolved() — never touching sla.json directly.
// ─────────────────────────────────────────────────────────────────────────────
import { type Client, type Guild, type TextChannel, EmbedBuilder } from 'discord.js';
import { JsonStore, genId } from './store';
import type { TicketRecord } from './types';
import { logger } from '../../utils/logger';

// ── SLA configuration per ticket type ────────────────────────────────────────

export interface SLATypeConfig {
  /** Minutes until first response is required. 0 = disabled. */
  firstResponseMinutes: number;
  /** Minutes until ticket must be resolved. 0 = disabled. */
  resolutionMinutes: number;
  /** Percent of time elapsed at which a "warning" notification fires (0–100). */
  warningThresholdPercent: number;
  /** Percent of time elapsed at which a "critical" notification fires. Must be >= warning. */
  criticalThresholdPercent: number;
  /** Channel ID where SLA warnings and breach notices are posted. */
  notifyChannelId?: string;
  /** Role IDs pinged only when an SLA is fully breached. */
  managerRoleIds: string[];
}

export const DEFAULT_SLA_TYPE_CONFIG: SLATypeConfig = {
  firstResponseMinutes: 0,
  resolutionMinutes: 0,
  warningThresholdPercent: 75,
  criticalThresholdPercent: 90,
  managerRoleIds: [],
};

/** Per-guild global SLA toggle + per-type configs. */
export interface SLAGuildConfig {
  guildId: string;
  enabled: boolean;
  /** Key: `${panelId}:${ticketType}`. */
  types: Record<string, SLATypeConfig>;
}

export type SLAStatus = 'ok' | 'warning' | 'critical' | 'breached';

/** Live SLA tracking record for one open (or recently resolved) ticket. */
export interface SLARecord {
  id: string;
  ticketId: string;
  ticketNumber: number;
  guildId: string;
  panelId: string;
  ticketType: string;
  channelId: string;
  openerId: string;
  createdAt: number;
  firstResponseAt?: number;
  resolvedAt?: number;
  /** Persisted on each sweep so the designer can display current state without re-computing. */
  firstResponseStatus: SLAStatus;
  resolutionStatus: SLAStatus;
  /** Timestamps of notifications already sent — prevents duplicate pings. */
  firstResponseWarnedAt?: number;
  firstResponseCriticalAt?: number;
  firstResponseBreachedAt?: number;
  resolutionWarnedAt?: number;
  resolutionCriticalAt?: number;
  resolutionBreachedAt?: number;
}

interface SLAData {
  guildConfigs: SLAGuildConfig[];
  records: SLARecord[];
}

export interface SLADashboard {
  enabled: boolean;
  totalTracked: number;
  open: number;
  warned: number;
  critical: number;
  breached: number;
  avgFirstResponseMs: number;
  avgResolutionMs: number;
  /** Percentage of all closed tickets that met every SLA target (no breach). */
  complianceRate: number;
}

const store = new JsonStore<SLAData>('sla.json', () => ({ guildConfigs: [], records: [] }));
const MAX_RECORDS = 10_000;

// ── Utilities ─────────────────────────────────────────────────────────────────

export function formatMs(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

export function computeSLAStatus(
  createdAt: number,
  responseAt: number | undefined,
  limitMinutes: number,
  thresholds: { warning: number; critical: number },
  now = Date.now(),
): { status: SLAStatus; remainingMs: number; elapsedPct: number } {
  if (limitMinutes <= 0) return { status: 'ok', remainingMs: Infinity, elapsedPct: 0 };
  const limit = limitMinutes * 60_000;
  const elapsed = (responseAt ?? now) - createdAt;
  const pct = Math.max(0, (elapsed / limit) * 100);
  const remaining = limit - elapsed;
  const status: SLAStatus =
    elapsed >= limit ? 'breached' :
    pct >= thresholds.critical ? 'critical' :
    pct >= thresholds.warning ? 'warning' : 'ok';
  return { status, remainingMs: remaining, elapsedPct: pct };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class SLAEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  async getGuildConfig(guildId: string): Promise<SLAGuildConfig> {
    const data = await store.read();
    return data.guildConfigs.find(c => c.guildId === guildId) ?? { guildId, enabled: false, types: {} };
  }

  async setEnabled(guildId: string, enabled: boolean): Promise<SLAGuildConfig> {
    return store.mutate(data => {
      let cfg = data.guildConfigs.find(c => c.guildId === guildId);
      if (!cfg) { cfg = { guildId, enabled, types: {} }; data.guildConfigs.push(cfg); }
      else cfg.enabled = enabled;
      return { ...cfg };
    });
  }

  async setTypeConfig(guildId: string, panelId: string, ticketType: string, config: SLATypeConfig): Promise<void> {
    await store.mutate(data => {
      let cfg = data.guildConfigs.find(c => c.guildId === guildId);
      if (!cfg) { cfg = { guildId, enabled: false, types: {} }; data.guildConfigs.push(cfg); }
      cfg.types[`${panelId}:${ticketType}`] = config;
    });
  }

  async removeTypeConfig(guildId: string, panelId: string, ticketType: string): Promise<void> {
    await store.mutate(data => {
      const cfg = data.guildConfigs.find(c => c.guildId === guildId);
      if (cfg) delete cfg.types[`${panelId}:${ticketType}`];
    });
  }

  async getTypeConfig(guildId: string, panelId: string, ticketType: string): Promise<SLATypeConfig | undefined> {
    const cfg = await this.getGuildConfig(guildId);
    return cfg.types[`${panelId}:${ticketType}`];
  }

  // ── Lifecycle hooks (called by ticket-engine.ts) ────────────────────────────

  /** Call immediately after a ticket channel is created. Creates a SLA tracking record if applicable. */
  async onTicketCreated(ticket: TicketRecord): Promise<void> {
    const cfg = await this.getGuildConfig(ticket.guildId);
    if (!cfg.enabled) return;
    const typeCfg = cfg.types[`${ticket.panelId}:${ticket.ticketType}`];
    if (!typeCfg || (typeCfg.firstResponseMinutes <= 0 && typeCfg.resolutionMinutes <= 0)) return;

    await store.mutate(data => {
      const rec: SLARecord = {
        id: genId('sla'),
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        guildId: ticket.guildId,
        panelId: ticket.panelId,
        ticketType: ticket.ticketType,
        channelId: ticket.channelId,
        openerId: ticket.openerId,
        createdAt: ticket.createdAt,
        firstResponseStatus: 'ok',
        resolutionStatus: 'ok',
      };
      data.records.push(rec);
      if (data.records.length > MAX_RECORDS) data.records = data.records.slice(-MAX_RECORDS);
    });
    logger.info(`[SLA] Tracking started for ticket #${ticket.number} (type: ${ticket.ticketType})`);
  }

  /** Call when a staff member claims a ticket (first staff touch). Idempotent — only records once. */
  async onFirstResponse(ticketId: string, _userId: string, timestamp: number): Promise<void> {
    await store.mutate(data => {
      const rec = data.records.find(r => r.ticketId === ticketId);
      if (!rec || rec.firstResponseAt) return;
      rec.firstResponseAt = timestamp;
      rec.firstResponseStatus = 'ok'; // reset — met the target
    });
  }

  /** Call when a ticket is closed. Records resolution time and freezes the record. */
  async onResolved(ticketId: string, timestamp: number): Promise<void> {
    await store.mutate(data => {
      const rec = data.records.find(r => r.ticketId === ticketId);
      if (!rec || rec.resolvedAt) return;
      rec.resolvedAt = timestamp;
    });
  }

  async getTicketSLA(ticketId: string): Promise<SLARecord | undefined> {
    const data = await store.read();
    return data.records.find(r => r.ticketId === ticketId);
  }

  // ── Sweeper (runs every 60 s) ───────────────────────────────────────────────

  async sweep(client: Client): Promise<void> {
    const data = await store.read();
    const now = Date.now();
    const openRecords = data.records.filter(r => !r.resolvedAt);

    for (const rec of openRecords) {
      const cfg = data.guildConfigs.find(c => c.guildId === rec.guildId);
      if (!cfg?.enabled) continue;
      const typeCfg = cfg.types[`${rec.panelId}:${rec.ticketType}`];
      if (!typeCfg) continue;

      let guild: Guild | null = null;
      const getGuild = async () => {
        if (!guild) guild = await client.guilds.fetch(rec.guildId).catch(() => null);
        return guild;
      };

      const thresholds = { warning: typeCfg.warningThresholdPercent, critical: typeCfg.criticalThresholdPercent };

      // ── First Response SLA ─────────────────────────────────────────────────
      if (typeCfg.firstResponseMinutes > 0 && !rec.firstResponseAt) {
        const { status, remainingMs } = computeSLAStatus(rec.createdAt, undefined, typeCfg.firstResponseMinutes, thresholds, now);

        if (status === 'warning' && !rec.firstResponseWarnedAt) {
          const g = await getGuild(); if (g) await this.sendNotification(g, rec, typeCfg, 'First Response', 'warning', remainingMs);
          await store.mutate(d => { const r = d.records.find(x => x.id === rec.id); if (r) { r.firstResponseWarnedAt = now; r.firstResponseStatus = 'warning'; } });
        } else if (status === 'critical' && !rec.firstResponseCriticalAt) {
          const g = await getGuild(); if (g) await this.sendNotification(g, rec, typeCfg, 'First Response', 'critical', remainingMs);
          await store.mutate(d => { const r = d.records.find(x => x.id === rec.id); if (r) { r.firstResponseCriticalAt = now; r.firstResponseStatus = 'critical'; } });
        } else if (status === 'breached' && !rec.firstResponseBreachedAt) {
          const g = await getGuild(); if (g) await this.sendNotification(g, rec, typeCfg, 'First Response', 'breached', 0);
          await store.mutate(d => { const r = d.records.find(x => x.id === rec.id); if (r) { r.firstResponseBreachedAt = now; r.firstResponseStatus = 'breached'; } });
        }
      }

      // ── Resolution SLA ─────────────────────────────────────────────────────
      if (typeCfg.resolutionMinutes > 0) {
        const { status, remainingMs } = computeSLAStatus(rec.createdAt, undefined, typeCfg.resolutionMinutes, thresholds, now);

        if (status === 'warning' && !rec.resolutionWarnedAt) {
          const g = await getGuild(); if (g) await this.sendNotification(g, rec, typeCfg, 'Resolution', 'warning', remainingMs);
          await store.mutate(d => { const r = d.records.find(x => x.id === rec.id); if (r) { r.resolutionWarnedAt = now; r.resolutionStatus = 'warning'; } });
        } else if (status === 'critical' && !rec.resolutionCriticalAt) {
          const g = await getGuild(); if (g) await this.sendNotification(g, rec, typeCfg, 'Resolution', 'critical', remainingMs);
          await store.mutate(d => { const r = d.records.find(x => x.id === rec.id); if (r) { r.resolutionCriticalAt = now; r.resolutionStatus = 'critical'; } });
        } else if (status === 'breached' && !rec.resolutionBreachedAt) {
          const g = await getGuild(); if (g) await this.sendNotification(g, rec, typeCfg, 'Resolution', 'breached', 0);
          await store.mutate(d => { const r = d.records.find(x => x.id === rec.id); if (r) { r.resolutionBreachedAt = now; r.resolutionStatus = 'breached'; } });
        }
      }
    }
  }

  private async sendNotification(
    guild: Guild,
    rec: SLARecord,
    cfg: SLATypeConfig,
    slaType: string,
    status: 'warning' | 'critical' | 'breached',
    remainingMs: number,
  ): Promise<void> {
    if (!cfg.notifyChannelId) return;
    const ch = await guild.channels.fetch(cfg.notifyChannelId).catch(() => null) as TextChannel | null;
    if (!ch?.isTextBased()) return;

    const color = status === 'warning' ? 0xfee75c : status === 'critical' ? 0xf5a623 : 0xed4245;
    const statusLabel = status === 'warning' ? '⚠️ Warning' : status === 'critical' ? '🔴 Critical' : '🚨 Breached';
    const pings = cfg.managerRoleIds.map(id => `<@&${id}>`).join(' ');

    const fields: { name: string; value: string; inline: boolean }[] = [
      { name: '🎫 Ticket', value: `<#${rec.channelId}> (#${rec.ticketNumber})`, inline: true },
      { name: '🏷️ Type', value: rec.ticketType, inline: true },
      { name: '⏱ Opened', value: `<t:${Math.floor(rec.createdAt / 1000)}:R>`, inline: true },
    ];
    if (remainingMs > 0) fields.push({ name: '⏳ Time Remaining', value: formatMs(remainingMs), inline: true });
    if (status === 'breached') fields.push({ name: '📊 SLA Target', value: slaType, inline: true });

    const embed = new EmbedBuilder().setColor(color)
      .setTitle(`${statusLabel} — SLA ${slaType}`)
      .addFields(fields)
      .setTimestamp();

    const content = (status === 'breached' && pings) ? pings : undefined;
    await ch.send({ content, embeds: [embed] }).catch(() => {});
    logger.info(`[SLA] ${statusLabel} notification sent for ticket #${rec.ticketNumber} (${slaType})`);
  }

  createSweeper(client: Client): NodeJS.Timeout {
    return setInterval(() => {
      this.sweep(client).catch(err => logger.warning('[SLA] Sweep error', err));
    }, 60_000);
  }

  // ── Analytics ───────────────────────────────────────────────────────────────

  async getDashboard(guildId: string): Promise<SLADashboard> {
    const [config, data] = await Promise.all([this.getGuildConfig(guildId), store.read()]);
    const records = data.records.filter(r => r.guildId === guildId);
    const open = records.filter(r => !r.resolvedAt);
    const closed = records.filter(r => r.resolvedAt);

    const warned   = open.filter(r => r.firstResponseStatus === 'warning'  || r.resolutionStatus === 'warning').length;
    const critical = open.filter(r => r.firstResponseStatus === 'critical' || r.resolutionStatus === 'critical').length;
    const breached = open.filter(r => r.firstResponseStatus === 'breached' || r.resolutionStatus === 'breached').length;

    const frTimes  = closed.filter(r => r.firstResponseAt).map(r => r.firstResponseAt! - r.createdAt);
    const resTimes = closed.filter(r => r.resolvedAt).map(r => r.resolvedAt! - r.createdAt);

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const compliant = closed.filter(r => !r.firstResponseBreachedAt && !r.resolutionBreachedAt).length;
    const complianceRate = closed.length ? Math.round((compliant / closed.length) * 100) : 100;

    return {
      enabled: config.enabled,
      totalTracked: records.length,
      open: open.length,
      warned, critical, breached,
      avgFirstResponseMs: avg(frTimes),
      avgResolutionMs: avg(resTimes),
      complianceRate,
    };
  }

  async getHistory(guildId: string, limit = 25): Promise<SLARecord[]> {
    const data = await store.read();
    return data.records
      .filter(r => r.guildId === guildId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getOpenRecords(guildId: string): Promise<SLARecord[]> {
    const data = await store.read();
    return data.records.filter(r => r.guildId === guildId && !r.resolvedAt);
  }
}

export const slaEngine = new SLAEngine();
