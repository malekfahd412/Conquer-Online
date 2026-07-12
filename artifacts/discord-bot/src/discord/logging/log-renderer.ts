import { EmbedBuilder } from 'discord.js';
import type {
  GuildMember,
  PartialGuildMember,
  User,
  PartialUser,
  Role,
  Message,
  PartialMessage,
  VoiceState,
  VoiceChannel,
  AuditLogEntry,
} from 'discord.js';

// ── Shared helpers ─────────────────────────────────────────────────────────

function ts(): number { return Math.floor(Date.now() / 1000); }
function userTag(u: User | PartialUser | null | undefined): string {
  if (!u) return 'Unknown';
  const name = u.globalName ?? u.username ?? u.id;
  return `<@${u.id}> **${name}**`;
}
function executorField(entry: AuditLogEntry | null | undefined): string {
  if (!entry?.executor) return 'Unknown (no audit log)';
  return userTag(entry.executor);
}

// ── Invite In ──────────────────────────────────────────────────────────────

export function buildInviteInEmbed(member: GuildMember): EmbedBuilder {
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
  const accountAge = accountAgeDays === 0 ? '< 1 day old ⚠️' : `${accountAgeDays} day(s)`;
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('📥 Member Joined')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '📅 Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: '🕒 Account Age', value: accountAge, inline: true },
      { name: '👥 Member Count', value: String(member.guild.memberCount), inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

// ── Invite Out ─────────────────────────────────────────────────────────────

export function buildInviteOutEmbed(member: GuildMember | PartialGuildMember): EmbedBuilder {
  const roles = 'roles' in member && member.roles && 'cache' in member.roles
    ? member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(' ') || 'None'
    : 'Unknown';
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('📤 Member Left')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '📅 Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      { name: '🎭 Roles', value: roles.slice(0, 1024), inline: false },
    )
    .setThumbnail(member.user?.displayAvatarURL())
    .setTimestamp();
}

// ── Verification ───────────────────────────────────────────────────────────

export function buildVerificationEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('✅ Member Verified')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '📅 Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

// ── Timeout ────────────────────────────────────────────────────────────────

export function buildTimeoutEmbed(
  member: GuildMember,
  entry: AuditLogEntry | null,
): EmbedBuilder {
  const until = member.communicationDisabledUntil;
  const untilStr = until ? `<t:${Math.floor(until.getTime() / 1000)}:R>` : 'Unknown';
  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('⏰ Member Timed Out')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '⏱️ Times Out', value: untilStr, inline: true },
      { name: '🔨 Moderator', value: executorField(entry), inline: false },
      { name: '📝 Reason', value: entry?.reason ?? 'No reason provided', inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
}

// ── Kick ───────────────────────────────────────────────────────────────────

export function buildKickEmbed(
  member: GuildMember | PartialGuildMember,
  entry: AuditLogEntry | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('👢 Member Kicked')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '🔨 Kicked By', value: executorField(entry), inline: false },
      { name: '📝 Reason', value: entry?.reason ?? 'No reason provided', inline: false },
    )
    .setThumbnail(member.user?.displayAvatarURL())
    .setTimestamp();
}

// ── Ban ────────────────────────────────────────────────────────────────────

export function buildBanEmbed(
  user: User | PartialUser,
  entry: AuditLogEntry | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔨 Member Banned')
    .setDescription(userTag(user))
    .addFields(
      { name: '🆔 User ID', value: user.id, inline: true },
      { name: '🔨 Banned By', value: executorField(entry), inline: false },
      { name: '📝 Reason', value: entry?.reason ?? 'No reason provided', inline: false },
    )
    .setThumbnail(user.displayAvatarURL?.() ?? null)
    .setTimestamp();
}

// ── Voice Join ─────────────────────────────────────────────────────────────

export function buildVoiceJoinEmbed(state: VoiceState): EmbedBuilder {
  const channel = state.channel as VoiceChannel | null;
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🔊 Voice Joined')
    .setDescription(userTag(state.member?.user))
    .addFields(
      { name: '🆔 User ID', value: state.id, inline: true },
      { name: '📢 Channel', value: channel ? `<#${channel.id}> **${channel.name}**` : 'Unknown', inline: true },
    )
    .setTimestamp();
}

// ── Voice Leave ────────────────────────────────────────────────────────────

export function buildVoiceLeaveEmbed(state: VoiceState): EmbedBuilder {
  const channel = state.channel as VoiceChannel | null;
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔇 Voice Left')
    .setDescription(userTag(state.member?.user))
    .addFields(
      { name: '🆔 User ID', value: state.id, inline: true },
      { name: '📢 Channel', value: channel ? `<#${channel.id}> **${channel.name}**` : 'Unknown', inline: true },
    )
    .setTimestamp();
}

// ── Voice Move ─────────────────────────────────────────────────────────────

export function buildVoiceMoveEmbed(oldState: VoiceState, newState: VoiceState): EmbedBuilder {
  const from = oldState.channel as VoiceChannel | null;
  const to = newState.channel as VoiceChannel | null;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔀 Voice Moved')
    .setDescription(userTag(newState.member?.user))
    .addFields(
      { name: '🆔 User ID', value: newState.id, inline: true },
      { name: '📤 From', value: from ? `<#${from.id}> **${from.name}**` : 'Unknown', inline: true },
      { name: '📥 To', value: to ? `<#${to.id}> **${to.name}**` : 'Unknown', inline: true },
    )
    .setTimestamp();
}

// ── Role Given ─────────────────────────────────────────────────────────────

export function buildRoleGivenEmbed(
  member: GuildMember,
  role: Role,
  entry: AuditLogEntry | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🟢 Role Given')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '🎭 Role', value: `<@&${role.id}> **${role.name}**`, inline: true },
      { name: '🔨 By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

// ── Role Removed ───────────────────────────────────────────────────────────

export function buildRoleRemovedEmbed(
  member: GuildMember,
  role: Role,
  entry: AuditLogEntry | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔴 Role Removed')
    .setDescription(userTag(member.user))
    .addFields(
      { name: '🆔 User ID', value: member.id, inline: true },
      { name: '🎭 Role', value: `<@&${role.id}> **${role.name}**`, inline: true },
      { name: '🔨 By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

// ── Message Deleted ────────────────────────────────────────────────────────

export function buildMessageDeletedEmbed(message: Message | PartialMessage): EmbedBuilder {
  const content = message.content?.slice(0, 2000) || '_No cached text content_';
  const attachments = message.attachments?.size
    ? `${message.attachments.size} attachment(s)`
    : null;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🗑️ Message Deleted')
    .setDescription(content)
    .addFields(
      { name: '👤 Author', value: userTag(message.author), inline: true },
      { name: '📢 Channel', value: `<#${message.channelId}>`, inline: true },
    )
    .setTimestamp();
  if (attachments) embed.addFields({ name: '📎 Attachments', value: attachments, inline: true });
  return embed;
}

// ── Sample / Test embeds (one per type) ───────────────────────────────────

export function buildSampleEmbed(type: import('./log-store').LogType): EmbedBuilder {
  const now = new Date();
  const fakeId = '123456789012345678';
  const fakeTs = `<t:${Math.floor(Date.now() / 1000)}:R>`;

  switch (type) {
    case 'invite_in':
      return new EmbedBuilder().setColor(0x57f287).setTitle('📥 Member Joined').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📅 Account Created', value: fakeTs, inline: true }, { name: '🕒 Account Age', value: '365 day(s)', inline: true }, { name: '👥 Member Count', value: '100', inline: true })
        .setTimestamp(now);
    case 'invite_out':
      return new EmbedBuilder().setColor(0xed4245).setTitle('📤 Member Left').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📅 Joined', value: fakeTs, inline: true }, { name: '🎭 Roles', value: '<@&111> **Member**', inline: false })
        .setTimestamp(now);
    case 'verification':
      return new EmbedBuilder().setColor(0x57f287).setTitle('✅ Member Verified').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📅 Joined', value: fakeTs, inline: true })
        .setTimestamp(now);
    case 'timeout':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('⏰ Member Timed Out').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '⏱️ Times Out', value: fakeTs, inline: true }, { name: '🔨 Moderator', value: '<@456> **AdminUser**', inline: false }, { name: '📝 Reason', value: 'Spamming', inline: false })
        .setTimestamp(now);
    case 'kick':
      return new EmbedBuilder().setColor(0xed4245).setTitle('👢 Member Kicked').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '🔨 Kicked By', value: '<@456> **AdminUser**', inline: false }, { name: '📝 Reason', value: 'Rule violation', inline: false })
        .setTimestamp(now);
    case 'ban':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🔨 Member Banned').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '🔨 Banned By', value: '<@456> **AdminUser**', inline: false }, { name: '📝 Reason', value: 'Harassment', inline: false })
        .setTimestamp(now);
    case 'voice_join':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🔊 Voice Joined').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice **General Voice**', inline: true })
        .setTimestamp(now);
    case 'voice_leave':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🔇 Voice Left').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice **General Voice**', inline: true })
        .setTimestamp(now);
    case 'voice_move':
      return new EmbedBuilder().setColor(0x5865f2).setTitle('🔀 Voice Moved').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📤 From', value: '#general-voice **General**', inline: true }, { name: '📥 To', value: '#gaming-voice **Gaming**', inline: true })
        .setTimestamp(now);
    case 'role_given':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🟢 Role Given').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '🎭 Role', value: '@Member **Member**', inline: true }, { name: '🔨 By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'role_removed':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🔴 Role Removed').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '🎭 Role', value: '@Member **Member**', inline: true }, { name: '🔨 By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'message_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🗑️ Message Deleted').setDescription('Hey everyone! This is a test message that got deleted.')
        .addFields({ name: '👤 Author', value: '<@123> **TestUser**', inline: true }, { name: '📢 Channel', value: '<#789>', inline: true })
        .setTimestamp(now);
    default:
      return new EmbedBuilder().setColor(0x99aab5).setTitle('📋 Log Sample').setDescription('This is a sample log embed.').setTimestamp(now);
  }
}
