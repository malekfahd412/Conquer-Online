// ─────────────────────────────────────────────────────────────────────────────
// Security Center Pro — Types and metadata for all 14 security modules.
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityModuleKey =
  | 'anti_raid'
  | 'anti_nuke'
  | 'anti_bot_add'
  | 'anti_channel'
  | 'anti_role'
  | 'anti_webhook'
  | 'anti_emoji_sticker'
  | 'anti_invite_spam'
  | 'anti_link_spam'
  | 'anti_mention_spam'
  | 'anti_ghost_ping'
  | 'anti_mass_dm'
  | 'anti_bad_words'
  | 'anti_scam_link';

export type SecurityPunishment = 'warn' | 'timeout' | 'kick' | 'ban';

export interface SecurityModuleConfig {
  enabled: boolean;
  logChannelId?: string;
  /** User IDs that bypass this module entirely. */
  whitelist: string[];
  /** Role IDs whose members bypass this module. */
  trustedRoles: string[];
  /** User IDs that bypass this module (admin-style trust). */
  trustedUsers: string[];
  punishment: SecurityPunishment;
  /** Number of actions that trigger a violation. */
  actionLimit: number;
  /** Time window in ms for rate-limiting. */
  timeWindowMs: number;
  /** Skip detection for bot accounts. */
  ignoreBots: boolean;
  /** Module-specific extra config (e.g. bad word list). */
  extra?: Record<string, unknown>;
}

export interface SecurityGuildConfig {
  guildId: string;
  emergencyMode: boolean;
  /** Channel IDs locked during emergency mode (used for restore). */
  emergencyLockedChannels: string[];
  /** Fallback log channel when a module has no specific channel set. */
  securityLogChannelId?: string;
  modules: Record<SecurityModuleKey, SecurityModuleConfig>;
}

export interface SecurityEvent {
  guildId: string;
  module: SecurityModuleKey;
  executorId: string;
  targetId?: string;
  action: string;
  detail?: string;
  timestamp: number;
  punishmentApplied?: SecurityPunishment;
  restored?: boolean;
}

export interface SecurityStoreData {
  guilds: Record<string, SecurityGuildConfig>;
  events: SecurityEvent[];
}

export interface ModuleMeta {
  label: string;
  emoji: string;
  description: string;
  eventLabel: string;
  color: number;
}

export const ALL_MODULE_KEYS: SecurityModuleKey[] = [
  'anti_raid',
  'anti_nuke',
  'anti_bot_add',
  'anti_channel',
  'anti_role',
  'anti_webhook',
  'anti_emoji_sticker',
  'anti_invite_spam',
  'anti_link_spam',
  'anti_mention_spam',
  'anti_ghost_ping',
  'anti_mass_dm',
  'anti_bad_words',
  'anti_scam_link',
];

export const MODULE_META: Record<SecurityModuleKey, ModuleMeta> = {
  anti_raid:          { label: 'Anti Raid',          emoji: '🌊', description: 'Detects and stops mass-join raids by rate-limiting guild member additions.',        eventLabel: 'Mass Join Raid Detected',       color: 0xed4245 },
  anti_nuke:          { label: 'Anti Nuke',           emoji: '💣', description: 'Prevents server nukes by detecting mass channel/role deletions by the same user.',  eventLabel: 'Server Nuke Attempt',           color: 0xed4245 },
  anti_bot_add:       { label: 'Anti Bot Add',        emoji: '🤖', description: 'Blocks unauthorized bot additions by non-trusted members.',                         eventLabel: 'Unauthorized Bot Added',        color: 0xf5a623 },
  anti_channel:       { label: 'Anti Channel Mod',    emoji: '💬', description: 'Protects channels from unauthorized creation, deletion, or updates.',               eventLabel: 'Unauthorized Channel Change',   color: 0xf5a623 },
  anti_role:          { label: 'Anti Role Mod',       emoji: '🎭', description: 'Protects roles from unauthorized creation, deletion, or permission changes.',       eventLabel: 'Unauthorized Role Change',      color: 0xf5a623 },
  anti_webhook:       { label: 'Anti Webhook',        emoji: '🔌', description: 'Blocks unauthorized webhook creation or deletion.',                                  eventLabel: 'Unauthorized Webhook Action',   color: 0xf5a623 },
  anti_emoji_sticker: { label: 'Anti Emoji/Sticker',  emoji: '😀', description: 'Detects and prevents mass emoji or sticker creation/deletion spam.',               eventLabel: 'Emoji/Sticker Spam Detected',   color: 0xfee75c },
  anti_invite_spam:   { label: 'Anti Invite Spam',    emoji: '🔗', description: 'Detects invite links posted in messages or rapid invite creation.',                 eventLabel: 'Invite Spam Detected',          color: 0xfee75c },
  anti_link_spam:     { label: 'Anti Link Spam',      emoji: '🌐', description: 'Detects rapid posting of external URLs in messages.',                               eventLabel: 'Link Spam Detected',            color: 0xfee75c },
  anti_mention_spam:  { label: 'Anti Mention Spam',   emoji: '📢', description: 'Detects mass user or role mentions in messages.',                                   eventLabel: 'Mention Spam Detected',         color: 0xf5a623 },
  anti_ghost_ping:    { label: 'Anti Ghost Ping',     emoji: '👻', description: 'Detects messages with mentions that are deleted shortly after sending.',            eventLabel: 'Ghost Ping Detected',           color: 0xfee75c },
  anti_mass_dm:       { label: 'Anti Mass DM',        emoji: '📨', description: 'Detects users sending large volumes of messages rapidly (mass DM proxy).',         eventLabel: 'Mass DM Pattern Detected',      color: 0xf5a623 },
  anti_bad_words:     { label: 'Anti Bad Words',      emoji: '🤬', description: 'Filters messages containing configured bad words or phrases.',                      eventLabel: 'Bad Word Detected',             color: 0xfee75c },
  anti_scam_link:     { label: 'Anti Scam Link',      emoji: '🎣', description: 'Detects known scam, phishing, and token-grab domains in messages.',                eventLabel: 'Scam Link Detected',            color: 0xed4245 },
};

/** Known scam/phishing domains. Checked against lowercased URLs. */
export const KNOWN_SCAM_DOMAINS: readonly string[] = [
  'discord-nitro.gift', 'discordgifts.site', 'discordapp.io', 'free-nitro.ru',
  'steamcommunity.ru', 'steamcommunity.gift', 'discordnitro.gift', 'nitro-discord.gift',
  'discord.gift.ru', 'discordgift.site', 'discord-gifts.org', 'grab-nitro.com',
  'get-nitro.ru', 'steamcommunity.gg', 'discord-gift.site', 'dlscord.com',
  'discorcl.com', 'discocrd.com', 'giftsairdrop.com', 'freegifts.site',
  'hxtp-discord.com', 'discrords.com', 'nitro-generator.online', 'steamgifts.com',
  'get-discord-nitro.com', 'discord-promo.com',
];
