import { promises as fs } from 'fs';
import path from 'path';
import type { StaffActionType, StaffPointsGuildData, StaffPointTransaction, LeaderboardPeriod } from './types';
import { DEFAULT_STAFF_POINTS } from './types';
import { genId } from './staff-store';

const DATA_PATH = path.join(process.cwd(), 'data', 'staff-points.json');
const MAX_TRANSACTIONS_PER_GUILD = 50_000;

interface FileData {
  guilds: Record<string, StaffPointsGuildData>;
}

function makeDefaultGuildData(guildId: string): StaffPointsGuildData {
  return { guildId, pointValues: { ...DEFAULT_STAFF_POINTS }, transactions: [] };
}

async function load(): Promise<FileData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null) {
      return (parsed as unknown) as FileData;
    }
  } catch { /* first run */ }
  return { guilds: {} };
}

async function save(data: FileData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getPointValues(guildId: string): Promise<Record<StaffActionType, number>> {
  const data = await load();
  const guild = data.guilds[guildId];
  // Backfill any action types added after a guild's config was first created.
  return { ...DEFAULT_STAFF_POINTS, ...(guild?.pointValues ?? {}) };
}

export async function setPointValue(guildId: string, action: StaffActionType, points: number): Promise<Record<StaffActionType, number>> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  guild.pointValues = { ...DEFAULT_STAFF_POINTS, ...guild.pointValues, [action]: points };
  data.guilds[guildId] = guild;
  await save(data);
  return guild.pointValues;
}

/** Records a point transaction for `action` using the guild's configured value. Returns the awarded amount. */
export async function awardPoints(guildId: string, userId: string, action: StaffActionType): Promise<number> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  const points = guild.pointValues[action] ?? DEFAULT_STAFF_POINTS[action] ?? 0;

  const tx: StaffPointTransaction = { id: genId(), guildId, userId, action, points, timestamp: Date.now() };
  guild.transactions.push(tx);
  if (guild.transactions.length > MAX_TRANSACTIONS_PER_GUILD) {
    guild.transactions = guild.transactions.slice(-MAX_TRANSACTIONS_PER_GUILD);
  }
  data.guilds[guildId] = guild;
  await save(data);
  return points;
}

function periodStart(period: LeaderboardPeriod, now: number): number {
  const d = new Date(now);
  switch (period) {
    case 'daily': {
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case 'weekly': {
      const day = d.getDay(); // 0 = Sunday
      const diff = (day + 6) % 7; // days since Monday
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - diff);
      return d.getTime();
    }
    case 'monthly': {
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }
    case 'alltime':
    default:
      return 0;
  }
}

export async function getTransactions(guildId: string, sinceMs = 0): Promise<StaffPointTransaction[]> {
  const data = await load();
  return (data.guilds[guildId]?.transactions ?? []).filter(t => t.timestamp >= sinceMs);
}

export interface LeaderboardEntry {
  userId: string;
  points: number;
  actionCount: number;
}

export async function getLeaderboard(guildId: string, period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  const since = periodStart(period, Date.now());
  const txs = await getTransactions(guildId, since);
  const totals = new Map<string, { points: number; actionCount: number }>();
  for (const tx of txs) {
    const entry = totals.get(tx.userId) ?? { points: 0, actionCount: 0 };
    entry.points += tx.points;
    entry.actionCount += 1;
    totals.set(tx.userId, entry);
  }
  return Array.from(totals.entries())
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.points - a.points);
}

/** Sum of points across all time for a single user — used on the profile page. */
export async function getUserTotalPoints(guildId: string, userId: string): Promise<number> {
  const data = await load();
  return (data.guilds[guildId]?.transactions ?? [])
    .filter(t => t.userId === userId)
    .reduce((sum, t) => sum + t.points, 0);
}

export { periodStart };
