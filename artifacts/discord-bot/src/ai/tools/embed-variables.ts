import type { Guild, GuildMember, TextChannel, Role } from 'discord.js';

export interface VariableContext {
  guild?: Guild;
  member?: GuildMember;
  channel?: TextChannel;
  role?: Role;
  /** Custom key-value pairs for server-specific variables */
  custom?: Record<string, string>;
  /** Current server online players (from data source) */
  serverOnline?: number;
  /** Current open ticket count */
  ticketsOpen?: number;
  /** Voice channel member count */
  voiceMembers?: number;
  /** Warning count */
  warnings?: number;
}

function fmt(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

/**
 * Resolves Discord-style template variables in a string.
 * Supported: {guild.name}, {guild.id}, {guild.members}, {guild.boosts},
 *            {guild.created}, {member.name}, {member.id}, {member.avatar},
 *            {member.joined}, {role.name}, {role.count}, {channel.name},
 *            {channel.topic}, {date}, {time}, {timestamp},
 *            {server.online}, {voice.members}, {tickets.open}, {warnings}
 */
export function resolveVariables(text: string, ctx: VariableContext): string {
  const now = new Date();

  const replacements: Record<string, string> = {
    // Guild
    'guild.name': ctx.guild?.name ?? 'Unknown Server',
    'guild.id': ctx.guild?.id ?? '0',
    'guild.members': String(ctx.guild?.memberCount ?? 0),
    'guild.boosts': String(ctx.guild?.premiumSubscriptionCount ?? 0),
    'guild.created': ctx.guild ? fmt(ctx.guild.createdAt) : 'Unknown',

    // Member
    'member.name': ctx.member?.displayName ?? ctx.member?.user.username ?? 'Unknown',
    'member.id': ctx.member?.id ?? '0',
    'member.avatar': ctx.member?.displayAvatarURL({ size: 128 }) ?? '',
    'member.joined': ctx.member?.joinedAt ? fmt(ctx.member.joinedAt) : 'Unknown',

    // Role
    'role.name': ctx.role?.name ?? 'Unknown Role',
    'role.count': ctx.role
      ? String(ctx.guild?.members.cache.filter(m => m.roles.cache.has(ctx.role!.id)).size ?? 0)
      : '0',

    // Channel
    'channel.name': ctx.channel?.name ?? 'unknown-channel',
    'channel.topic': ctx.channel?.topic ?? '',

    // Time
    'date': now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    'time': now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    'timestamp': `<t:${Math.floor(now.getTime() / 1000)}:F>`,

    // Server metrics
    'server.online': String(ctx.serverOnline ?? 0),
    'voice.members': String(ctx.voiceMembers ?? 0),
    'tickets.open': String(ctx.ticketsOpen ?? 0),
    'warnings': String(ctx.warnings ?? 0),
  };

  // Merge custom variables
  if (ctx.custom) {
    for (const [k, v] of Object.entries(ctx.custom)) {
      replacements[k] = v;
    }
  }

  return text.replace(/\{([^}]+)\}/g, (match, key: string) => {
    return key in replacements ? replacements[key] : match;
  });
}

/** Applies variable resolution to all string fields of an embed data object */
export function resolveEmbedVariables(
  data: Record<string, unknown>,
  ctx: VariableContext,
): Record<string, unknown> {
  const resolve = (v: unknown): unknown => {
    if (typeof v === 'string') return resolveVariables(v, ctx);
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, resolve(val)]),
      );
    }
    return v;
  };
  return resolve(data) as Record<string, unknown>;
}

/** Extract all unique variable placeholders from a string */
export function extractVariables(text: string): string[] {
  const matches = text.match(/\{([^}]+)\}/g) ?? [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}
