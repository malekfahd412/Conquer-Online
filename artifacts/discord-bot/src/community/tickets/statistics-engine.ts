// ─────────────────────────────────────────────────────────────────────────────
// StatisticsEngine — records lifecycle events and computes dashboards. Owns
// data/tickets/statistics.json exclusively. Other engines report events to it
// through `record()` — they never touch statistics.json directly.
// ─────────────────────────────────────────────────────────────────────────────
import { JsonStore } from './store';
import type { StatisticsEvent, StatisticsEventType } from './types';

interface StatisticsData {
  events: StatisticsEvent[];
}

const store = new JsonStore<StatisticsData>('statistics.json', () => ({ events: [] }));
const MAX_EVENTS = 20_000;

export interface TicketDashboard {
  total: number;
  open: number;
  closed: number;
  avgResponseMs: number;
  leaderboard: [string, number][];
}

export class StatisticsEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  async record(event: Omit<StatisticsEvent, 'timestamp'> & { timestamp?: number }): Promise<void> {
    await store.mutate(data => {
      data.events.push({ ...event, timestamp: event.timestamp ?? Date.now() });
      if (data.events.length > MAX_EVENTS) data.events = data.events.slice(-MAX_EVENTS);
    });
  }

  private async eventsFor(guildId: string, panelId?: string): Promise<StatisticsEvent[]> {
    const data = await store.read();
    return data.events.filter(e => e.guildId === guildId && (!panelId || e.panelId === panelId));
  }

  async getDashboard(guildId: string, panelId?: string): Promise<TicketDashboard> {
    const events = await this.eventsFor(guildId, panelId);
    const opened = events.filter(e => e.type === 'opened');
    const closed = events.filter(e => e.type === 'closed');
    const openedTicketIds = new Set(opened.map(e => e.ticketId));
    const closedTicketIds = new Set(closed.map(e => e.ticketId));
    const openCount = [...openedTicketIds].filter(id => !closedTicketIds.has(id)).length;

    const responseTimes = events.filter((e): e is StatisticsEvent & { responseMs: number } => e.type === 'claimed' && e.responseMs !== undefined).map(e => e.responseMs);
    const avgResponseMs = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

    const claimCounts = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'claimed') claimCounts.set(e.userId, (claimCounts.get(e.userId) ?? 0) + 1);
    }
    const leaderboard = Array.from(claimCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return { total: openedTicketIds.size, open: openCount, closed: closedTicketIds.size, avgResponseMs, leaderboard };
  }

  async countByType(guildId: string, type: StatisticsEventType, panelId?: string): Promise<number> {
    const events = await this.eventsFor(guildId, panelId);
    return events.filter(e => e.type === type).length;
  }

  /** Returns stats for a rolling time window (e.g. last 7 days). Used for the weekly summary post. */
  async getWeeklyStats(guildId: string, sinceMs: number, panelId?: string): Promise<{
    opened: number;
    closed: number;
    avgResponseMs: number;
    topStaff: [string, number][];
  }> {
    const events = (await this.eventsFor(guildId, panelId)).filter(e => e.timestamp >= sinceMs);
    const opened = new Set(events.filter(e => e.type === 'opened').map(e => e.ticketId)).size;
    const closed = new Set(events.filter(e => e.type === 'closed').map(e => e.ticketId)).size;
    const responseTimes = events
      .filter((e): e is StatisticsEvent & { responseMs: number } => e.type === 'claimed' && e.responseMs !== undefined)
      .map(e => e.responseMs);
    const avgResponseMs = responseTimes.length
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const claimCounts = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'claimed') claimCounts.set(e.userId, (claimCounts.get(e.userId) ?? 0) + 1);
    }
    const topStaff = Array.from(claimCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { opened, closed, avgResponseMs, topStaff };
  }
}

export const statisticsEngine = new StatisticsEngine();
