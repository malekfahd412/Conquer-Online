import { EmbedBuilder } from 'discord.js';
import type { ModCase, ModerationAction } from './types';
import { formatDuration, discordFull, discordRelative } from './types';

// ── Color palette ──────────────────────────────────────────────────────────

const COLOR: Record<ModerationAction, number> = {
  warn:          0xfee75c,
  unwarn:        0x57f287,
  clearwarnings: 0x57f287,
  mute:          0xf5a623,
  unmute:        0x57f287,
  temptimeout:   0xf5a623,
  kick:          0xe67e22,
  ban:           0xed4245,
  unban:         0x57f287,
  softban:       0xe67e22,
  tempban:       0xed4245,
  role_add:      0x5865f2,
  role_remove:   0x99aab5,
  nickname:      0x5865f2,
  lock:          0xf5a623,
  unlock:        0x57f287,
  slowmode:      0x5865f2,
  purge:         0x99aab5,
};

const EMOJI: Record<ModerationAction, string> = {
  warn:          '⚠️',
  unwarn:        '✅',
  clearwarnings: '🧹',
  mute:          '🔇',
  unmute:        '🔊',
  temptimeout:   '⏱️',
  kick:          '👢',
  ban:           '🔨',
  unban:         '🔓',
  softban:       '🧹',
  tempban:       '⏳',
  role_add:      '➕',
  role_remove:   '➖',
  nickname:      '✏️',
  lock:          '🔒',
  unlock:        '🔓',
  slowmode:      '🐢',
  purge:         '🗑️',
};

const LABEL: Record<ModerationAction, string> = {
  warn:          'Warning Issued',
  unwarn:        'Warning Removed',
  clearwarnings: 'Warnings Cleared',
  mute:          'Member Muted',
  unmute:        'Member Unmuted',
  temptimeout:   'Temporary Timeout',
  kick:          'Member Kicked',
  ban:           'Member Banned',
  unban:         'Member Unbanned',
  softban:       'Member Softbanned',
  tempban:       'Temporary Ban',
  role_add:      'Role Added',
  role_remove:   'Role Removed',
  nickname:      'Nickname Changed',
  lock:          'Channel Locked',
  unlock:        'Channel Unlocked',
  slowmode:      'Slowmode Changed',
  purge:         'Messages Purged',
};

// ── Main case embed builder ────────────────────────────────────────────────

export function buildCaseEmbed(c: ModCase, warnCount?: number): EmbedBuilder {
  const color = COLOR[c.action] ?? 0x99aab5;
  const emoji = EMOJI[c.action] ?? '🔨';
  const label = LABEL[c.action] ?? c.action;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${label}`)
    .setTimestamp(c.timestamp)
    .setFooter({ text: `Case ${c.id}` });

  // Target
  embed.addFields({
    name: '👤 User',
    value: `<@${c.targetId}> (${c.targetTag})\nID: \`${c.targetId}\``,
    inline: true,
  });

  // Moderator
  embed.addFields({
    name: '🛡️ Moderator',
    value: `<@${c.moderatorId}> (${c.moderatorTag})`,
    inline: true,
  });

  // Case ID + timestamp
  embed.addFields({
    name: '📋 Case',
    value: `\`${c.id}\` • ${discordFull(c.timestamp)}`,
    inline: false,
  });

  // Reason
  embed.addFields({
    name: '📝 Reason',
    value: c.reason || '_No reason provided_',
    inline: false,
  });

  // Duration / expiry for temp actions
  if (c.expiresAt) {
    const ms = c.expiresAt - c.timestamp;
    embed.addFields({
      name: '⏱️ Duration',
      value: `${formatDuration(ms)} (expires ${discordRelative(c.expiresAt)})`,
      inline: true,
    });
  }

  // Status
  embed.addFields({
    name: '🔘 Status',
    value: c.active ? '✅ Active' : '✅ Resolved / Expired',
    inline: true,
  });

  // Extra data
  const extra = c.extra ?? {};

  if (c.action === 'warn' && typeof warnCount === 'number') {
    embed.addFields({
      name: '⚠️ Warning Count',
      value: `User now has **${warnCount}** active warning(s)`,
      inline: true,
    });
  }

  if (c.action === 'purge' && typeof extra.amount === 'number') {
    embed.addFields({ name: '🗑️ Deleted', value: `${extra.amount} messages`, inline: true });
  }

  if ((c.action === 'lock' || c.action === 'unlock') && extra.channelId) {
    embed.addFields({ name: '📢 Channel', value: `<#${extra.channelId}>`, inline: true });
  }

  if (c.action === 'slowmode' && typeof extra.seconds === 'number') {
    embed.addFields({
      name: '🐢 Slowmode',
      value: extra.seconds === 0 ? 'Disabled' : `${extra.seconds}s`,
      inline: true,
    });
  }

  if ((c.action === 'role_add' || c.action === 'role_remove') && extra.roleId) {
    embed.addFields({
      name: '🎭 Role',
      value: `<@&${extra.roleId}>`,
      inline: true,
    });
  }

  if (c.action === 'nickname') {
    const from = extra.oldNick ? `\`${extra.oldNick}\`` : '_(none)_';
    const to   = extra.newNick ? `\`${extra.newNick}\`` : '_(reset)_';
    embed.addFields({ name: '✏️ Nickname', value: `${from} → ${to}`, inline: false });
  }

  return embed;
}

// ── DM embed (shown to punished user) ────────────────────────────────────

export function buildDMEmbed(c: ModCase, serverName: string): EmbedBuilder {
  const color = COLOR[c.action] ?? 0x99aab5;
  const emoji = EMOJI[c.action] ?? '🔨';
  const label = LABEL[c.action] ?? c.action;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${label}`)
    .setDescription(`You have received a moderation action in **${serverName}**.`)
    .setTimestamp(c.timestamp)
    .setFooter({ text: `Case ${c.id}` });

  embed.addFields({ name: '📝 Reason', value: c.reason || '_No reason provided_', inline: false });

  if (c.expiresAt) {
    const ms = c.expiresAt - c.timestamp;
    embed.addFields({
      name: '⏱️ Duration',
      value: `${formatDuration(ms)} (expires ${discordRelative(c.expiresAt)})`,
      inline: false,
    });
  }

  return embed;
}

// ── History embed ──────────────────────────────────────────────────────────

export function buildHistoryEmbed(
  cases: ModCase[],
  targetTag: string,
  targetId: string,
  page: number,
  totalPages: number,
): EmbedBuilder {
  const PAGE_SIZE = 10;
  const slice = cases.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lines = slice.map(c => {
    const emoji = EMOJI[c.action] ?? '❓';
    const ts    = `<t:${Math.floor(c.timestamp / 1000)}:d>`;
    const dur   = c.expiresAt ? ` (${formatDuration(c.expiresAt - c.timestamp)})` : '';
    const status = c.active ? '' : ' ~~resolved~~';
    return `\`${c.id}\` ${emoji} **${LABEL[c.action] ?? c.action}**${dur} — ${ts}${status}`;
  });

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📜 Moderation History — ${targetTag}`)
    .setDescription(lines.length ? lines.join('\n') : '_No moderation history found._')
    .addFields({
      name: '🔍 User',
      value: `<@${targetId}> (ID: \`${targetId}\`)`,
      inline: true,
    })
    .addFields({
      name: '📊 Total Cases',
      value: `${cases.length}`,
      inline: true,
    })
    .setFooter({ text: `Page ${page + 1} / ${Math.max(1, totalPages)}` })
    .setTimestamp();
}

// ── Auto-punishment embed (sent to log channel) ───────────────────────────

export function buildAutoPunishEmbed(
  targetTag: string,
  targetId: string,
  warnCount: number,
  action: 'timeout' | 'kick' | 'ban',
  caseId: string,
  duration?: number,
): EmbedBuilder {
  const actionLabel = action === 'timeout' ? 'Timeout' : action === 'kick' ? 'Kick' : 'Ban';
  const dur = duration ? ` (${formatDuration(duration)})` : '';

  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`🤖 Auto-Punishment — ${actionLabel}${dur}`)
    .setDescription(
      `<@${targetId}> reached **${warnCount} warnings** and was automatically ${action === 'timeout' ? 'timed out' : action === 'kick' ? 'kicked' : 'banned'}.`,
    )
    .addFields(
      { name: '👤 User', value: `${targetTag} (${targetId})`, inline: true },
      { name: '⚠️ Warnings', value: `${warnCount}`, inline: true },
      { name: '📋 Case', value: `\`${caseId}\``, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Auto-punishment triggered by warning threshold' });
}
