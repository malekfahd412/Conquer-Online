import { promises as fs } from 'fs';
import path from 'path';
import type { GuildModConfig } from './types';
import { makeDefaultConfig } from './types';

const DATA_PATH = path.join(process.cwd(), 'data', 'mod-config.json');

// ── Persistence ────────────────────────────────────────────────────────────

interface ConfigData {
  guilds: Record<string, GuildModConfig>;
}

async function load(): Promise<ConfigData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed.guilds === 'object') {
      return (parsed as unknown) as ConfigData;
    }
  } catch { /* first run */ }
  return { guilds: {} };
}

async function save(data: ConfigData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getGuildModConfig(guildId: string): Promise<GuildModConfig> {
  const data = await load();
  return data.guilds[guildId] ?? makeDefaultConfig(guildId);
}

export async function setGuildModConfig(cfg: GuildModConfig): Promise<void> {
  const data = await load();
  data.guilds[cfg.guildId] = cfg;
  await save(data);
}

export async function updateGuildModConfig(
  guildId: string,
  patch: Partial<Omit<GuildModConfig, 'guildId'>>,
): Promise<GuildModConfig> {
  const data = await load();
  const current = data.guilds[guildId] ?? makeDefaultConfig(guildId);
  data.guilds[guildId] = { ...current, ...patch };
  await save(data);
  return data.guilds[guildId];
}

// Serialized write queue so concurrent allocateCaseId calls never produce duplicate IDs.
let caseIdQueue: Promise<unknown> = Promise.resolve();

/** Allocate the next case number and return the full ID string, e.g. "MOD-0042". */
export function allocateCaseId(guildId: string): Promise<string> {
  const result = caseIdQueue.then(async () => {
    const data = await load();
    const current = data.guilds[guildId] ?? makeDefaultConfig(guildId);
    const num = current.nextCaseNumber;
    current.nextCaseNumber = num + 1;
    data.guilds[guildId] = current;
    await save(data);
    const prefix = current.casePrefix || 'MOD';
    return `${prefix}-${String(num).padStart(4, '0')}`;
  });
  caseIdQueue = result.then(() => undefined, () => undefined);
  return result;
}
