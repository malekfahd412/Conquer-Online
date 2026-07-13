import { promises as fs } from 'fs';
import path from 'path';
import type { StaffReportsGuildData, StaffReportRecord } from './types';
import { genId } from './staff-store';

const DATA_PATH = path.join(process.cwd(), 'data', 'staff-reports.json');
const MAX_HISTORY_PER_GUILD = 200;

interface FileData {
  guilds: Record<string, StaffReportsGuildData>;
}

function makeDefaultGuildData(guildId: string): StaffReportsGuildData {
  return { guildId, dailyEnabled: false, weeklyEnabled: false, monthlyEnabled: false, history: [] };
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

export async function getReportConfig(guildId: string): Promise<StaffReportsGuildData> {
  const data = await load();
  return data.guilds[guildId] ?? makeDefaultGuildData(guildId);
}

export async function getAllReportConfigs(): Promise<StaffReportsGuildData[]> {
  const data = await load();
  return Object.values(data.guilds);
}

export async function updateReportConfig(
  guildId: string,
  patch: Partial<Omit<StaffReportsGuildData, 'guildId' | 'history'>>,
): Promise<StaffReportsGuildData> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  data.guilds[guildId] = { ...guild, ...patch };
  await save(data);
  return data.guilds[guildId];
}

export async function recordReportRun(
  guildId: string,
  type: 'daily' | 'weekly' | 'monthly',
  summary: string,
  periodKey: string,
): Promise<StaffReportRecord> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  const record: StaffReportRecord = { id: genId(), type, generatedAt: Date.now(), summary };
  guild.history.unshift(record);
  if (guild.history.length > MAX_HISTORY_PER_GUILD) guild.history.length = MAX_HISTORY_PER_GUILD;
  if (type === 'daily') guild.lastDailyKey = periodKey;
  if (type === 'weekly') guild.lastWeeklyKey = periodKey;
  if (type === 'monthly') guild.lastMonthlyKey = periodKey;
  data.guilds[guildId] = guild;
  await save(data);
  return record;
}
