import { promises as fs } from 'fs';
import path from 'path';

// ── Log Types ──────────────────────────────────────────────────────────────

export type LogType =
  | 'invite_in'
  | 'invite_out'
  | 'verification'
  | 'timeout'
  | 'kick'
  | 'ban'
  | 'voice_join'
  | 'voice_leave'
  | 'voice_move'
  | 'role_given'
  | 'role_removed'
  | 'message_deleted'
  | 'logs_all';

export const ALL_LOG_TYPES: LogType[] = [
  'invite_in', 'invite_out', 'verification', 'timeout', 'kick', 'ban',
  'voice_join', 'voice_leave', 'voice_move', 'role_given', 'role_removed',
  'message_deleted', 'logs_all',
];

export const EVENT_LOG_TYPES: LogType[] = ALL_LOG_TYPES.filter(t => t !== 'logs_all');

export interface LogTypeMeta {
  label: string;
  emoji: string;
  description: string;
  color: number;
}

export const LOG_TYPE_META: Record<LogType, LogTypeMeta> = {
  invite_in:       { label: 'Invite In',        emoji: '📥', description: 'Member joined the server',              color: 0x57f287 },
  invite_out:      { label: 'Invite Out',        emoji: '📤', description: 'Member left the server',               color: 0xed4245 },
  verification:    { label: 'Verification',      emoji: '✅', description: 'Member passed verification',           color: 0x57f287 },
  timeout:         { label: 'Timeout',           emoji: '⏰', description: 'Member received a timeout',            color: 0xf5a623 },
  kick:            { label: 'Kick',              emoji: '👢', description: 'Member kicked from server',            color: 0xed4245 },
  ban:             { label: 'Ban',               emoji: '🔨', description: 'Member banned from server',            color: 0xed4245 },
  voice_join:      { label: 'Voice Join',        emoji: '🔊', description: 'Member joined a voice channel',       color: 0x57f287 },
  voice_leave:     { label: 'Voice Leave',       emoji: '🔇', description: 'Member left a voice channel',         color: 0xed4245 },
  voice_move:      { label: 'Voice Move',        emoji: '🔀', description: 'Member moved between voice channels', color: 0x5865f2 },
  role_given:      { label: 'Role Given',        emoji: '🟢', description: 'Role assigned to a member',           color: 0x57f287 },
  role_removed:    { label: 'Role Removed',      emoji: '🔴', description: 'Role removed from a member',          color: 0xed4245 },
  message_deleted: { label: 'Message Deleted',   emoji: '🗑️', description: 'Message deleted in a channel',        color: 0xed4245 },
  logs_all:        { label: 'Logs All Server',   emoji: '📋', description: 'Fallback channel for all enabled logs that have no dedicated channel', color: 0x99aab5 },
};

// ── Config Schema ──────────────────────────────────────────────────────────

export interface LogTypeConfig {
  enabled: boolean;
  channelId?: string;
}

export interface GuildLogConfig {
  guildId: string;
  types: Partial<Record<LogType, LogTypeConfig>>;
}

interface LogData {
  guilds: GuildLogConfig[];
}

// ── Persistence ────────────────────────────────────────────────────────────

const DATA_PATH = path.join(process.cwd(), 'data', 'server-logs.json');

let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<LogData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.configs)) {
      return { guilds: [] };
    }
    if (Array.isArray(parsed.guilds)) {
      return parsed as LogData;
    }
    return { guilds: [] };
  } catch {
    return { guilds: [] };
  }
}

async function save(data: LogData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function mutate<R>(fn: (data: LogData) => R): Promise<R> {
  const run = async (): Promise<R> => {
    const data = await load();
    const result = fn(data);
    await save(data);
    return result;
  };
  const p = writeQueue.then(run, run);
  writeQueue = p.then(() => undefined, () => undefined);
  return p;
}

function getOrCreate(data: LogData, guildId: string): GuildLogConfig {
  let g = data.guilds.find(x => x.guildId === guildId);
  if (!g) { g = { guildId, types: {} }; data.guilds.push(g); }
  return g;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getGuildLogConfig(guildId: string): Promise<GuildLogConfig> {
  const data = await load();
  return data.guilds.find(g => g.guildId === guildId) ?? { guildId, types: {} };
}

export async function getTypeConfig(guildId: string, type: LogType): Promise<LogTypeConfig> {
  const cfg = await getGuildLogConfig(guildId);
  return cfg.types[type] ?? { enabled: false };
}

export async function setTypeConfig(guildId: string, type: LogType, patch: Partial<LogTypeConfig>): Promise<LogTypeConfig> {
  return mutate(data => {
    const g = getOrCreate(data, guildId);
    const existing = g.types[type] ?? { enabled: false };
    g.types[type] = { ...existing, ...patch };
    return g.types[type]!;
  });
}

export async function toggleType(guildId: string, type: LogType): Promise<boolean> {
  const current = await getTypeConfig(guildId, type);
  await setTypeConfig(guildId, type, { enabled: !current.enabled });
  return !current.enabled;
}

/**
 * Resolve which channel should receive an event of `type`.
 *
 * Resolution order:
 *  1. type-specific channel — only if that type is enabled AND has a channelId
 *  2. logs_all fallback channel — used when:
 *     - The type is enabled (or has no explicit config — i.e. new out-of-the-box)
 *     - AND logs_all is enabled and has a channelId
 *  3. Nothing — type is disabled or no channels configured
 */
export async function resolveLogChannel(guildId: string, type: LogType): Promise<string | undefined> {
  if (type === 'logs_all') return undefined;
  const cfg = await getGuildLogConfig(guildId);
  const typeCfg = cfg.types[type];

  if (typeCfg?.enabled === false) return undefined;

  if (typeCfg?.enabled && typeCfg.channelId) return typeCfg.channelId;

  const fallback = cfg.types['logs_all'];
  if (fallback?.enabled && fallback.channelId) return fallback.channelId;

  return undefined;
}
