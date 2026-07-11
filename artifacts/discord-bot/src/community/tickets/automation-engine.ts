// ─────────────────────────────────────────────────────────────────────────────
// AutomationEngine — lifecycle automation: per-panel cooldowns, activity
// tracking for inactivity auto-close, and scheduled auto-delete after close.
// Owns data/tickets/automation.json exclusively.
// ─────────────────────────────────────────────────────────────────────────────
import { JsonStore } from './store';
import type { AutomationActivityEntry, AutomationCooldownEntry, AutomationLogEntry, TicketPanel } from './types';
import { logger } from '../../utils/logger';

interface AutomationData {
  cooldowns: AutomationCooldownEntry[];
  activity: AutomationActivityEntry[];
  log: AutomationLogEntry[];
}

const store = new JsonStore<AutomationData>('automation.json', () => ({ cooldowns: [], activity: [], log: [] }));

export class AutomationEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  /**
   * Returns null when the user may open a ticket, or the number of seconds remaining.
   * `cfg` must be the ticket-type-resolved config (see `resolveTicketType`) so `cfg.cooldown`
   * reflects this specific ticket type's own setting; `ticketType` scopes the cooldown
   * clock so each ticket type on a panel tracks its own cooldown independently.
   */
  async remainingCooldownSeconds(cfg: TicketPanel, userId: string, ticketType: string): Promise<number> {
    if (cfg.cooldown <= 0) return 0;
    const data = await store.read();
    const entry = data.cooldowns.find(c => c.guildId === cfg.guildId && c.panelId === cfg.id && c.userId === userId && c.ticketType === ticketType);
    if (!entry) return 0;
    const elapsedSeconds = (Date.now() - entry.lastClosedAt) / 1000;
    const remaining = cfg.cooldown - elapsedSeconds;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  }

  /** `cfg` should be the ticket-type-resolved config (see `resolveTicketType`). */
  async recordClose(cfg: TicketPanel, userId: string, ticketType: string): Promise<void> {
    await store.mutate(data => {
      const existing = data.cooldowns.find(c => c.guildId === cfg.guildId && c.panelId === cfg.id && c.userId === userId && c.ticketType === ticketType);
      if (existing) existing.lastClosedAt = Date.now();
      else data.cooldowns.push({ guildId: cfg.guildId, panelId: cfg.id, userId, ticketType, lastClosedAt: Date.now() });
    });
  }

  async touchActivity(ticketId: string, channelId: string): Promise<void> {
    await store.mutate(data => {
      const existing = data.activity.find(a => a.ticketId === ticketId);
      if (existing) existing.lastActivityAt = Date.now();
      else data.activity.push({ ticketId, channelId, lastActivityAt: Date.now() });
    });
  }

  async clearActivity(ticketId: string): Promise<void> {
    await store.mutate(data => {
      data.activity = data.activity.filter(a => a.ticketId !== ticketId);
    });
  }

  async getInactiveTicketIds(thresholdMinutes: number): Promise<string[]> {
    if (thresholdMinutes <= 0) return [];
    const data = await store.read();
    const cutoff = Date.now() - thresholdMinutes * 60_000;
    return data.activity.filter(a => a.lastActivityAt < cutoff).map(a => a.ticketId);
  }

  async logAction(ticketId: string, action: AutomationLogEntry['action']): Promise<void> {
    await store.mutate(data => {
      data.log.push({ ticketId, action, timestamp: Date.now() });
      if (data.log.length > 2000) data.log = data.log.slice(-2000);
    });
  }

  /** Wired to an interval by TicketSystem; scans all guilds' open tickets for inactivity auto-close. */
  createInactivitySweeper(onInactive: (ticketId: string) => Promise<void>, intervalMs = 5 * 60_000): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const data = await store.read();
        for (const entry of data.activity) {
          await onInactive(entry.ticketId).catch(err => logger.warning(`[TICKETS] Inactivity sweep failed for ${entry.ticketId}`, err));
        }
      } catch (err) {
        logger.warning('[TICKETS] AutomationEngine inactivity sweep crashed', err);
      }
    }, intervalMs);
  }
}

export const automationEngine = new AutomationEngine();
