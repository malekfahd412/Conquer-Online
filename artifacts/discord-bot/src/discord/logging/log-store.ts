import { promises as fs } from 'fs';
import path from 'path';

// ── Log Types ──────────────────────────────────────────────────────────────

export type LogType =
  // Membership
  | 'invite_in'
  | 'invite_out'
  | 'verification'
  // Moderation
  | 'timeout'
  | 'kick'
  | 'ban'
  // Messages
  | 'message_deleted'
  | 'message_edited'
  // Voice — movement
  | 'voice_join'
  | 'voice_leave'
  | 'voice_move'
  // Voice — server-enforced state
  | 'voice_server_mute'
  | 'voice_server_unmute'
  | 'voice_server_deafen'
  | 'voice_server_undeafen'
  // Voice — self state
  | 'voice_self_mute'
  | 'voice_self_deafen'
  // Voice — activity
  | 'voice_camera_on'
  | 'voice_camera_off'
  | 'voice_stream_start'
  | 'voice_stream_stop'
  // Roles — member assignment
  | 'role_given'
  | 'role_removed'
  // Roles — server level
  | 'role_created'
  | 'role_deleted'
  | 'role_updated'
  | 'role_permissions_updated'
  // Channels
  | 'channel_created'
  | 'channel_deleted'
  | 'channel_updated'
  // Invites
  | 'invite_created'
  | 'invite_deleted'
  // Server
  | 'server_name_changed'
  | 'server_icon_changed'
  | 'server_banner_changed'
  | 'server_vanity_changed'
  | 'server_boost_level'
  // Emojis & Stickers
  | 'emoji_created'
  | 'emoji_deleted'
  | 'emoji_updated'
  | 'sticker_created'
  | 'sticker_deleted'
  | 'sticker_updated'
  // Global fallback
  | 'logs_all';

// ── Category Grouping ──────────────────────────────────────────────────────

export type LogCategoryKey =
  | 'moderation'
  | 'messages'
  | 'voice'
  | 'roles'
  | 'channels'
  | 'emojis'
  | 'invites'
  | 'server';

export interface LogCategory {
  key: LogCategoryKey;
  label: string;
  emoji: string;
  types: LogType[];
}

export const LOG_CATEGORIES: LogCategory[] = [
  {
    key: 'moderation',
    label: 'Moderation',
    emoji: '👮',
    types: ['timeout', 'kick', 'ban'],
  },
  {
    key: 'messages',
    label: 'Messages',
    emoji: '💬',
    types: ['message_deleted', 'message_edited'],
  },
  {
    key: 'voice',
    label: 'Voice',
    emoji: '🎙',
    types: [
      'voice_join', 'voice_leave', 'voice_move',
      'voice_server_mute', 'voice_server_unmute',
      'voice_server_deafen', 'voice_server_undeafen',
      'voice_self_mute', 'voice_self_deafen',
      'voice_camera_on', 'voice_camera_off',
      'voice_stream_start', 'voice_stream_stop',
    ],
  },
  {
    key: 'roles',
    label: 'Roles',
    emoji: '🎭',
    types: ['role_given', 'role_removed', 'role_created', 'role_deleted', 'role_updated', 'role_permissions_updated'],
  },
  {
    key: 'channels',
    label: 'Channels',
    emoji: '📺',
    types: ['channel_created', 'channel_deleted', 'channel_updated'],
  },
  {
    key: 'emojis',
    label: 'Emojis',
    emoji: '😊',
    types: ['emoji_created', 'emoji_deleted', 'emoji_updated', 'sticker_created', 'sticker_deleted', 'sticker_updated'],
  },
  {
    key: 'invites',
    label: 'Invites',
    emoji: '🎫',
    types: ['invite_in', 'invite_out', 'invite_created', 'invite_deleted'],
  },
  {
    key: 'server',
    label: 'Server',
    emoji: '⚙️',
    types: ['verification', 'server_name_changed', 'server_icon_changed', 'server_banner_changed', 'server_vanity_changed', 'server_boost_level'],
  },
];

/** Returns the category key for a given log type, or null for logs_all. */
export function getCategoryForType(type: LogType): LogCategoryKey | null {
  for (const cat of LOG_CATEGORIES) {
    if ((cat.types as LogType[]).includes(type)) return cat.key;
  }
  return null;
}

export const ALL_LOG_TYPES: LogType[] = [
  ...LOG_CATEGORIES.flatMap(c => c.types),
  'logs_all',
];

export const EVENT_LOG_TYPES: LogType[] = ALL_LOG_TYPES.filter(t => t !== 'logs_all');

// ── Type Metadata ──────────────────────────────────────────────────────────

export interface LogTypeMeta {
  label: string;
  emoji: string;
  description: string;
  color: number;
}

export const LOG_TYPE_META: Record<LogType, LogTypeMeta> = {
  // Membership
  invite_in:                  { label: 'Member Joined',          emoji: '📥', description: 'Member joined the server',                     color: 0x57f287 },
  invite_out:                 { label: 'Member Left',            emoji: '📤', description: 'Member left the server',                        color: 0xed4245 },
  verification:               { label: 'Verification',           emoji: '✅', description: 'Member passed verification',                    color: 0x57f287 },
  // Moderation
  timeout:                    { label: 'Timeout',                emoji: '⏰', description: 'Member received a timeout',                     color: 0xf5a623 },
  kick:                       { label: 'Kick',                   emoji: '👢', description: 'Member kicked from server',                     color: 0xed4245 },
  ban:                        { label: 'Ban',                    emoji: '🔨', description: 'Member banned from server',                     color: 0xed4245 },
  // Messages
  message_deleted:            { label: 'Message Deleted',        emoji: '🗑️', description: 'A message was deleted',                         color: 0xed4245 },
  message_edited:             { label: 'Message Edited',         emoji: '✏️', description: 'A message was edited',                          color: 0xf5a623 },
  // Voice movement
  voice_join:                 { label: 'Voice Join',             emoji: '🔊', description: 'Member joined a voice channel',                 color: 0x57f287 },
  voice_leave:                { label: 'Voice Leave',            emoji: '🔇', description: 'Member left a voice channel',                   color: 0xed4245 },
  voice_move:                 { label: 'Voice Move',             emoji: '🔀', description: 'Member moved between voice channels',           color: 0x5865f2 },
  // Voice server state
  voice_server_mute:          { label: 'Server Mute',            emoji: '🔕', description: 'Member was server-muted',                       color: 0xf5a623 },
  voice_server_unmute:        { label: 'Server Unmute',          emoji: '🔔', description: 'Member was server-unmuted',                     color: 0x57f287 },
  voice_server_deafen:        { label: 'Server Deafen',          emoji: '🙉', description: 'Member was server-deafened',                    color: 0xf5a623 },
  voice_server_undeafen:      { label: 'Server Undeafen',        emoji: '👂', description: 'Member was server-undeafened',                  color: 0x57f287 },
  // Voice self state
  voice_self_mute:            { label: 'Self Mute',              emoji: '🤫', description: 'Member muted themselves',                       color: 0x99aab5 },
  voice_self_deafen:          { label: 'Self Deafen',            emoji: '🙈', description: 'Member deafened themselves',                    color: 0x99aab5 },
  // Voice activity
  voice_camera_on:            { label: 'Camera On',              emoji: '📷', description: 'Member turned their camera on',                 color: 0x57f287 },
  voice_camera_off:           { label: 'Camera Off',             emoji: '📵', description: 'Member turned their camera off',                color: 0x99aab5 },
  voice_stream_start:         { label: 'Stream Start',           emoji: '📡', description: 'Member started streaming',                      color: 0x57f287 },
  voice_stream_stop:          { label: 'Stream Stop',            emoji: '⏹️', description: 'Member stopped streaming',                      color: 0x99aab5 },
  // Roles — member
  role_given:                 { label: 'Role Given',             emoji: '🟢', description: 'Role assigned to a member',                     color: 0x57f287 },
  role_removed:               { label: 'Role Removed',           emoji: '🔴', description: 'Role removed from a member',                    color: 0xed4245 },
  // Roles — server
  role_created:               { label: 'Role Created',           emoji: '➕', description: 'A new role was created',                        color: 0x57f287 },
  role_deleted:               { label: 'Role Deleted',           emoji: '➖', description: 'A role was deleted',                            color: 0xed4245 },
  role_updated:               { label: 'Role Updated',           emoji: '📝', description: 'A role was updated (name, color, etc.)',         color: 0xf5a623 },
  role_permissions_updated:   { label: 'Role Perms Updated',     emoji: '🔐', description: 'A role\'s permissions were changed',             color: 0xf5a623 },
  // Channels
  channel_created:            { label: 'Channel Created',        emoji: '📢', description: 'A new channel was created',                     color: 0x57f287 },
  channel_deleted:            { label: 'Channel Deleted',        emoji: '🗑️', description: 'A channel was deleted',                         color: 0xed4245 },
  channel_updated:            { label: 'Channel Updated',        emoji: '⚙️', description: 'A channel was updated (name, topic, etc.)',      color: 0xf5a623 },
  // Invites
  invite_created:             { label: 'Invite Created',         emoji: '🔗', description: 'A new invite was created',                      color: 0x57f287 },
  invite_deleted:             { label: 'Invite Deleted',         emoji: '❌', description: 'An invite was deleted',                         color: 0xed4245 },
  // Server
  server_name_changed:        { label: 'Server Name Changed',    emoji: '🏷️', description: 'The server name was changed',                   color: 0xf5a623 },
  server_icon_changed:        { label: 'Server Icon Changed',    emoji: '🖼️', description: 'The server icon was changed',                   color: 0xf5a623 },
  server_banner_changed:      { label: 'Server Banner Changed',  emoji: '🎨', description: 'The server banner was changed',                 color: 0xf5a623 },
  server_vanity_changed:      { label: 'Vanity URL Changed',     emoji: '🔖', description: 'The server\'s vanity URL was changed',          color: 0xf5a623 },
  server_boost_level:         { label: 'Boost Level Changed',    emoji: '🚀', description: 'The server\'s boost level changed',             color: 0xf47fff },
  // Emojis & Stickers
  emoji_created:              { label: 'Emoji Created',          emoji: '😊', description: 'A custom emoji was created',                    color: 0x57f287 },
  emoji_deleted:              { label: 'Emoji Deleted',          emoji: '😢', description: 'A custom emoji was deleted',                    color: 0xed4245 },
  emoji_updated:              { label: 'Emoji Updated',          emoji: '😮', description: 'A custom emoji was updated',                    color: 0xf5a623 },
  sticker_created:            { label: 'Sticker Created',        emoji: '🎉', description: 'A custom sticker was created',                  color: 0x57f287 },
  sticker_deleted:            { label: 'Sticker Deleted',        emoji: '😥', description: 'A custom sticker was deleted',                  color: 0xed4245 },
  sticker_updated:            { label: 'Sticker Updated',        emoji: '🎊', description: 'A custom sticker was updated',                  color: 0xf5a623 },
  // Fallback
  logs_all:                   { label: 'Logs All (fallback)',    emoji: '📋', description: 'Fallback channel for all logs without a dedicated channel', color: 0x99aab5 },
};

// ── Config Schema ──────────────────────────────────────────────────────────

export interface LogTypeConfig {
  enabled: boolean;
  channelId?: string;
  /** Custom embed color (hex integer, e.g. 0x57f287). Overrides the default. */
  color?: number;
  /** Role IDs to @mention when this log fires. */
  mentionRoles?: string[];
  /** User IDs whose events should be silently ignored. */
  ignoreUsers?: string[];
  /** Role IDs — members holding any of these roles are ignored. */
  ignoreRoles?: string[];
  /** When true, events caused by bots are ignored. */
  ignoreBots?: boolean;
}

export interface GuildLogConfig {
  guildId: string;
  types: Partial<Record<LogType, LogTypeConfig>>;
}

interface LogData {
  guilds: GuildLogConfig[];
}

// ── Resolved Log Config ────────────────────────────────────────────────────

/**
 * Fully resolved config for posting a log event.
 * Returns null if this event type is disabled or has no channel.
 */
export interface ResolvedLogConfig {
  channelId: string;
  color?: number;
  mentionRoles?: string[];
  ignoreUsers?: string[];
  ignoreRoles?: string[];
  ignoreBots?: boolean;
}

// ── Persistence ────────────────────────────────────────────────────────────

const DATA_PATH = path.join(process.cwd(), 'data', 'server-logs.json');

let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<LogData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.configs)) return { guilds: [] };
    if (Array.isArray(parsed.guilds)) return (parsed as unknown) as LogData;
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

export async function setTypeConfig(
  guildId: string,
  type: LogType,
  patch: Partial<LogTypeConfig>,
): Promise<LogTypeConfig> {
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

export async function toggleIgnoreBots(guildId: string, type: LogType): Promise<boolean> {
  const current = await getTypeConfig(guildId, type);
  const next = !current.ignoreBots;
  await setTypeConfig(guildId, type, { ignoreBots: next });
  return next;
}

/**
 * Resolve the full posting config for a log event type.
 *
 * Resolution order:
 *  1. type-specific channel — if that type is enabled AND has a channelId
 *  2. logs_all fallback — if logs_all is enabled and has a channelId
 *  3. null — type is disabled or no channel configured
 */
export async function resolveLogConfig(
  guildId: string,
  type: LogType,
): Promise<ResolvedLogConfig | null> {
  if (type === 'logs_all') return null;
  const cfg = await getGuildLogConfig(guildId);
  const typeCfg = cfg.types[type];

  if (typeCfg?.enabled === false) return null;

  let channelId: string | undefined;
  if (typeCfg?.enabled && typeCfg.channelId) {
    channelId = typeCfg.channelId;
  } else {
    const fallback = cfg.types['logs_all'];
    if (fallback?.enabled && fallback.channelId) {
      channelId = fallback.channelId;
    }
  }

  if (!channelId) return null;

  return {
    channelId,
    color:        typeCfg?.color,
    mentionRoles: typeCfg?.mentionRoles,
    ignoreUsers:  typeCfg?.ignoreUsers,
    ignoreRoles:  typeCfg?.ignoreRoles,
    ignoreBots:   typeCfg?.ignoreBots,
  };
}

/** Legacy helper — kept for backward compat. Prefer resolveLogConfig. */
export async function resolveLogChannel(guildId: string, type: LogType): Promise<string | undefined> {
  const r = await resolveLogConfig(guildId, type);
  return r?.channelId;
}
