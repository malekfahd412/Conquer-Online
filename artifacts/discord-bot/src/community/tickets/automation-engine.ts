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

  /** Returns null when the user may open a ticket, or the number of seconds remaining. */
  async remainingCooldownSeconds(panel: TicketPanel, userId: string): Promise<number> {
    if (panel.cooldown <= 0) return 0;
    const data = await store.read();
    const entry = data.cooldowns.find(c => c.guildId === panel.guildId && c.panelId === panel.id && c.userId === userId);
    if (!entry) return 0;
    const elapsedSeconds = (Date.now() - entry.lastClosedAt) / 1000;
    const remaining = panel.cooldown - elapsedSeconds;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  }

  async recordClose(panel: TicketPanel, userId: string): Promise<void> {
    await store.mutate(data => {
      const existing = data.cooldowns.find(c => c.guildId === panel.guildId && c.panelId === panel.id && c.userId === userId);
      if (existing) existing.lastClosedAt = Date.now();
      else data.cooldowns.push({ guildId: panel.guildId, panelId: panel.id, userId, lastClosedAt: Date.now() });
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
