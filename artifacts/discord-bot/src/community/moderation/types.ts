// ── Moderation Action Types ────────────────────────────────────────────────

export type ModerationAction =
  | 'warn'
  | 'unwarn'
  | 'clearwarnings'
  | 'mute'
  | 'unmute'
  | 'temptimeout'
  | 'kick'
  | 'ban'
  | 'unban'
  | 'softban'
  | 'tempban'
  | 'role_add'
  | 'role_remove'
  | 'nickname'
  | 'lock'
  | 'unlock'
  | 'slowmode'
  | 'purge';

// ── Case ──────────────────────────────────────────────────────────────────

export interface ModCase {
  /** e.g. "MOD-0001" */
  id: string;
  guildId: string;
  /** Snowflake of the target user */
  targetId: string;
  /** Cached username at time of action */
  targetTag: string;
  /** Snowflake of the moderator */
  moderatorId: string;
  /** Cached username at time of action */
  moderatorTag: string;
  action: ModerationAction;
  reason: string;
  /** Unix epoch ms */
  timestamp: number;
  /** Unix epoch ms — set for tempban / temptimeout */
  expiresAt?: number;
  /** false when manually resolved or automatically expired */
  active: boolean;
  /** Extra data: { days, warnCount, amount, seconds, roleId, nickname, etc. } */
  extra?: Record<string, unknown>;
}

// ── Guild Config ───────────────────────────────────────────────────────────

export interface AutoPunishThreshold {
  /** Number of active warnings that triggers this threshold */
  warns: number;
  /** Punishment to apply */
  action: 'timeout' | 'kick' | 'ban';
  /** Duration in ms — only meaningful for 'timeout' */
  duration?: number;
}

export interface AutoPunishConfig {
  enabled: boolean;
  thresholds: AutoPunishThreshold[];
}

export interface GuildModConfig {
  guildId: string;
  /** Role IDs permitted to use moderation commands */
  modRoles: string[];
  /** DM the target user on punishment */
  dmOnPunish: boolean;
  autoPunish: AutoPunishConfig;
  /** Default reason text per action (optional) */
  defaultReasons: Partial<Record<ModerationAction, string>>;
  /** Prefix for case IDs — default 'MOD' */
  casePrefix: string;
  /** Next sequential case number */
  nextCaseNumber: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export const DEFAULT_AUTO_PUNISH: AutoPunishConfig = {
  enabled: true,
  thresholds: [
    { warns: 3, action: 'timeout', duration: 3_600_000 },  // 1 hour timeout
    { warns: 5, action: 'kick' },
    { warns: 7, action: 'ban' },
  ],
};

export function makeDefaultConfig(guildId: string): GuildModConfig {
  return {
    guildId,
    modRoles: [],
    dmOnPunish: true,
    autoPunish: { ...DEFAULT_AUTO_PUNISH },
    defaultReasons: {},
    casePrefix: 'MOD',
    nextCaseNumber: 1,
  };
}

/** Parse a human duration string → ms, or null if invalid.
 *  Supported: 1s, 5m, 2h, 7d, 2w  */
export function parseDuration(s: string): number | null {
  const match = /^(\d+)\s*(s|m|h|d|w)$/i.exec(s.trim());
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n <= 0) return null;
  const unit = match[2].toLowerCase();
  const mult: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return n * (mult[unit] ?? 0);
}

/** Format ms duration → human string: "1h 30m", "7d" etc. */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  const w = Math.floor(ms / 604_800_000); if (w) parts.push(`${w}w`);
  const d = Math.floor((ms % 604_800_000) / 86_400_000); if (d) parts.push(`${d}d`);
  const h = Math.floor((ms % 86_400_000) / 3_600_000); if (h) parts.push(`${h}h`);
  const m = Math.floor((ms % 3_600_000) / 60_000); if (m) parts.push(`${m}m`);
  const s = Math.floor((ms % 60_000) / 1_000); if (s && parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

/** Format a unix-ms timestamp as a Discord relative time string */
export function discordRelative(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}
export function discordFull(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}
