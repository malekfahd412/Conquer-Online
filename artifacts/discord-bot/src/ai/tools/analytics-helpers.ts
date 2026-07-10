import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';

/** Format bytes to human-readable */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Format a number with commas */
export function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format a date to relative/absolute */
export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Discord timestamp */
export function discordTs(ms: number, style = 'f'): string {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/** Progress bar */
export function progressBar(value: number, max: number, length = 10): string {
  const filled = Math.round((value / Math.max(1, max)) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/** Get text channel activity score (messages per recent cache) */
export async function getChannelMessageCount(ch: TextChannel, limit = 100): Promise<number> {
  try {
    const messages = await ch.messages.fetch({ limit });
    return messages.size;
  } catch {
    return 0;
  }
}

/** Group guild members by join month */
export function groupByJoinMonth(members: GuildMember[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const m of members) {
    if (!m.joinedAt) continue;
    const key = m.joinedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

/** Get all text channels from guild */
export function getTextChannels(guild: Guild): TextChannel[] {
  return guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .map(c => c as TextChannel);
}

/** Get voice member stats */
export function getVoiceStats(guild: Guild): { activeChannels: number; totalMembers: number; channels: Array<{ name: string; members: number }> } {
  const voiceChannels = guild.channels.cache.filter(c =>
    c.type === ChannelType.GuildVoice && 'members' in c
  );
  let totalMembers = 0;
  let activeChannels = 0;
  const channels: Array<{ name: string; members: number }> = [];
  for (const [, ch] of voiceChannels) {
    if (!('members' in ch)) continue;
    const count = (ch as { members: { size: number } }).members.size;
    if (count > 0) activeChannels++;
    totalMembers += count;
    channels.push({ name: ch.name, members: count });
  }
  return { activeChannels, totalMembers, channels: channels.sort((a, b) => b.members - a.members) };
}

/** Build a simple analytics embed field table */
export function buildTable(rows: Array<[string, string | number]>, maxRows = 15): string {
  return rows.slice(0, maxRows)
    .map(([label, value]) => `\`${String(value).padStart(6)}\` ${label}`)
    .join('\n');
}
