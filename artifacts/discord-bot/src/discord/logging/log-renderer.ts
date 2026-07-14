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
  GuildAuditLogsEntry,
  GuildChannel,
  GuildEmoji,
  Sticker,
  Invite,
  Guild,
} from 'discord.js';
type AuditLogEntry = GuildAuditLogsEntry;
import type { LogType } from './log-store';

// ── Shared helpers ─────────────────────────────────────────────────────────

export function userTag(u: User | PartialUser | null | undefined): string {
  if (!u) return 'Unknown';
  const name = u.globalName ?? u.username ?? u.id;
  return `<@${u.id}> **${name}**`;
}

function executorField(entry: AuditLogEntry | null | undefined): string {
  if (!entry?.executor) return 'Unknown (no audit log)';
  return userTag(entry.executor);
}

function diffField(oldVal: string | null | undefined, newVal: string | null | undefined): string {
  const o = oldVal ?? '_none_';
  const n = newVal ?? '_none_';
  if (o === n) return n;
  return `~~${o}~~ → ${n}`;
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

export function buildTimeoutEmbed(member: GuildMember, entry: AuditLogEntry | null): EmbedBuilder {
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

export function buildKickEmbed(member: GuildMember | PartialGuildMember, entry: AuditLogEntry | null): EmbedBuilder {
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

export function buildBanEmbed(user: User | PartialUser, entry: AuditLogEntry | null): EmbedBuilder {
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
  const to   = newState.channel as VoiceChannel | null;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔀 Voice Moved')
    .setDescription(userTag(newState.member?.user))
    .addFields(
      { name: '🆔 User ID', value: newState.id, inline: true },
      { name: '📤 From', value: from ? `<#${from.id}> **${from.name}**` : 'Unknown', inline: true },
      { name: '📥 To',   value: to   ? `<#${to.id}> **${to.name}**`     : 'Unknown', inline: true },
    )
    .setTimestamp();
}

// ── Voice State Changes ────────────────────────────────────────────────────

function buildVoiceStateEmbed(
  title: string,
  color: number,
  state: VoiceState,
  extra?: { name: string; value: string; inline?: boolean }[],
): EmbedBuilder {
  const channel = state.channel as VoiceChannel | null;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(userTag(state.member?.user))
    .addFields(
      { name: '🆔 User ID', value: state.id, inline: true },
      { name: '📢 Channel', value: channel ? `<#${channel.id}> **${channel.name}**` : 'Unknown', inline: true },
    );
  if (extra?.length) embed.addFields(...extra);
  return embed.setTimestamp();
}

export function buildVoiceServerMuteEmbed(state: VoiceState):    EmbedBuilder { return buildVoiceStateEmbed('🔕 Server Muted', 0xf5a623, state); }
export function buildVoiceServerUnmuteEmbed(state: VoiceState):  EmbedBuilder { return buildVoiceStateEmbed('🔔 Server Unmuted', 0x57f287, state); }
export function buildVoiceServerDeafenEmbed(state: VoiceState):  EmbedBuilder { return buildVoiceStateEmbed('🙉 Server Deafened', 0xf5a623, state); }
export function buildVoiceServerUndeafenEmbed(state: VoiceState):EmbedBuilder { return buildVoiceStateEmbed('👂 Server Undeafened', 0x57f287, state); }
export function buildVoiceSelfMuteEmbed(state: VoiceState):      EmbedBuilder { return buildVoiceStateEmbed('🤫 Self Muted', 0x99aab5, state); }
export function buildVoiceSelfDeafenEmbed(state: VoiceState):    EmbedBuilder { return buildVoiceStateEmbed('🙈 Self Deafened', 0x99aab5, state); }
export function buildVoiceCameraOnEmbed(state: VoiceState):      EmbedBuilder { return buildVoiceStateEmbed('📷 Camera On', 0x57f287, state); }
export function buildVoiceCameraOffEmbed(state: VoiceState):     EmbedBuilder { return buildVoiceStateEmbed('📵 Camera Off', 0x99aab5, state); }
export function buildVoiceStreamStartEmbed(state: VoiceState):   EmbedBuilder { return buildVoiceStateEmbed('📡 Stream Started', 0x57f287, state); }
export function buildVoiceStreamStopEmbed(state: VoiceState):    EmbedBuilder { return buildVoiceStateEmbed('⏹️ Stream Stopped', 0x99aab5, state); }

// ── Role Given / Removed ───────────────────────────────────────────────────

export function buildRoleGivenEmbed(member: GuildMember, role: Role, entry: AuditLogEntry | null): EmbedBuilder {
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

export function buildRoleRemovedEmbed(member: GuildMember, role: Role, entry: AuditLogEntry | null): EmbedBuilder {
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

// ── Role Created / Deleted / Updated ──────────────────────────────────────

export function buildRoleCreatedEmbed(role: Role, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('➕ Role Created')
    .addFields(
      { name: '🎭 Role', value: `<@&${role.id}> **${role.name}**`, inline: true },
      { name: '🆔 Role ID', value: role.id, inline: true },
      { name: '🎨 Color', value: role.hexColor, inline: true },
      { name: '🔨 Created By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildRoleDeletedEmbed(role: Role, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('➖ Role Deleted')
    .addFields(
      { name: '🎭 Role', value: `**${role.name}**`, inline: true },
      { name: '🆔 Role ID', value: role.id, inline: true },
      { name: '🔨 Deleted By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildRoleUpdatedEmbed(oldRole: Role, newRole: Role, entry: AuditLogEntry | null): EmbedBuilder {
  const changes: string[] = [];
  if (oldRole.name !== newRole.name)   changes.push(`**Name:** ~~${oldRole.name}~~ → ${newRole.name}`);
  if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Color:** ~~${oldRole.hexColor}~~ → ${newRole.hexColor}`);
  if (oldRole.hoist !== newRole.hoist) changes.push(`**Hoisted:** ${newRole.hoist ? 'Yes' : 'No'}`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`**Mentionable:** ${newRole.mentionable ? 'Yes' : 'No'}`);

  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('📝 Role Updated')
    .addFields(
      { name: '🎭 Role', value: `<@&${newRole.id}> **${newRole.name}**`, inline: true },
      { name: '🆔 Role ID', value: newRole.id, inline: true },
      { name: '📋 Changes', value: changes.length ? changes.join('\n') : '_No tracked changes_', inline: false },
      { name: '🔨 Updated By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildRolePermissionsUpdatedEmbed(oldRole: Role, newRole: Role, entry: AuditLogEntry | null): EmbedBuilder {
  const oldPerms = oldRole.permissions.toArray();
  const newPerms = newRole.permissions.toArray();
  const added   = newPerms.filter(p => !oldPerms.includes(p));
  const removed = oldPerms.filter(p => !newPerms.includes(p));

  const fmt = (arr: string[]): string =>
    arr.length ? arr.map(p => `\`${p}\``).join(', ').slice(0, 1024) : '_none_';

  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('🔐 Role Permissions Updated')
    .addFields(
      { name: '🎭 Role', value: `<@&${newRole.id}> **${newRole.name}**`, inline: true },
      { name: '🆔 Role ID', value: newRole.id, inline: true },
      { name: '✅ Granted', value: fmt(added), inline: false },
      { name: '❌ Revoked', value: fmt(removed), inline: false },
      { name: '🔨 Updated By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

// ── Channel Created / Deleted / Updated ───────────────────────────────────

export function buildChannelCreatedEmbed(channel: GuildChannel, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('📢 Channel Created')
    .addFields(
      { name: '📢 Channel', value: `<#${channel.id}> **${channel.name}**`, inline: true },
      { name: '🆔 Channel ID', value: channel.id, inline: true },
      { name: '📁 Type', value: channel.type.toString(), inline: true },
      { name: '🔨 Created By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildChannelDeletedEmbed(channel: GuildChannel, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🗑️ Channel Deleted')
    .addFields(
      { name: '📢 Channel', value: `**#${channel.name}**`, inline: true },
      { name: '🆔 Channel ID', value: channel.id, inline: true },
      { name: '🔨 Deleted By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildChannelUpdatedEmbed(oldCh: GuildChannel, newCh: GuildChannel, entry: AuditLogEntry | null): EmbedBuilder {
  const changes: string[] = [];
  if (oldCh.name !== newCh.name) changes.push(`**Name:** ~~${oldCh.name}~~ → ${newCh.name}`);

  // Topic (text channels)
  const oldTopic = 'topic' in oldCh ? (oldCh as { topic?: string | null }).topic : null;
  const newTopic = 'topic' in newCh ? (newCh as { topic?: string | null }).topic : null;
  if (oldTopic !== newTopic) {
    changes.push(`**Topic:** ${diffField(oldTopic ?? undefined, newTopic ?? undefined)}`);
  }

  // NSFW
  const oldNsfw = 'nsfw' in oldCh ? (oldCh as { nsfw?: boolean }).nsfw : undefined;
  const newNsfw = 'nsfw' in newCh ? (newCh as { nsfw?: boolean }).nsfw : undefined;
  if (oldNsfw !== newNsfw) changes.push(`**NSFW:** ${newNsfw ? 'Enabled' : 'Disabled'}`);

  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('⚙️ Channel Updated')
    .addFields(
      { name: '📢 Channel', value: `<#${newCh.id}> **${newCh.name}**`, inline: true },
      { name: '🆔 Channel ID', value: newCh.id, inline: true },
      { name: '📋 Changes', value: changes.length ? changes.join('\n') : '_No tracked changes_', inline: false },
      { name: '🔨 Updated By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

// ── Invite Created / Deleted ───────────────────────────────────────────────

export function buildInviteCreatedEmbed(invite: Invite): EmbedBuilder {
  const expiry = invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'Never';
  const maxUses = invite.maxUses ? String(invite.maxUses) : '∞';
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🔗 Invite Created')
    .addFields(
      { name: '🔑 Code', value: `\`${invite.code}\``, inline: true },
      { name: '📢 Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
      { name: '👤 Created By', value: invite.inviter ? userTag(invite.inviter) : 'Unknown', inline: false },
      { name: '♾️ Max Uses', value: maxUses, inline: true },
      { name: '⏰ Expires', value: expiry, inline: true },
    )
    .setTimestamp();
}

export function buildInviteDeletedEmbed(invite: Invite): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('❌ Invite Deleted')
    .addFields(
      { name: '🔑 Code', value: `\`${invite.code}\``, inline: true },
      { name: '📢 Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
      { name: '👤 Created By', value: invite.inviter ? userTag(invite.inviter) : 'Unknown', inline: false },
      { name: '📊 Uses', value: String(invite.uses ?? 0), inline: true },
    )
    .setTimestamp();
}

// ── Message Deleted / Edited ───────────────────────────────────────────────

export function buildMessageDeletedEmbed(message: Message | PartialMessage): EmbedBuilder {
  const content = message.content?.slice(0, 2000) || '_No cached text content_';
  const attachments = message.attachments?.size ? `${message.attachments.size} attachment(s)` : null;
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

export function buildMessageEditedEmbed(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): EmbedBuilder {
  const before = oldMessage.content?.slice(0, 1000) || '_No cached content_';
  const after  = newMessage.content?.slice(0, 1000) || '_Empty_';
  const jumpUrl = newMessage.url;
  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('✏️ Message Edited')
    .addFields(
      { name: '👤 Author', value: userTag(newMessage.author), inline: true },
      { name: '📢 Channel', value: `<#${newMessage.channelId}>`, inline: true },
      { name: '🔗 Jump', value: `[Go to message](${jumpUrl})`, inline: true },
      { name: '📝 Before', value: before, inline: false },
      { name: '📝 After',  value: after,  inline: false },
    )
    .setTimestamp();
}

// ── Server Changes ─────────────────────────────────────────────────────────

export function buildServerNameChangedEmbed(oldGuild: Guild, newGuild: Guild, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('🏷️ Server Name Changed')
    .addFields(
      { name: '📋 Before', value: oldGuild.name, inline: true },
      { name: '📋 After',  value: newGuild.name, inline: true },
      { name: '🔨 Changed By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildServerIconChangedEmbed(newGuild: Guild, entry: AuditLogEntry | null): EmbedBuilder {
  const iconUrl = newGuild.iconURL({ size: 256 });
  const embed = new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('🖼️ Server Icon Changed')
    .addFields({ name: '🔨 Changed By', value: executorField(entry), inline: false })
    .setTimestamp();
  if (iconUrl) embed.setThumbnail(iconUrl);
  return embed;
}

export function buildServerBannerChangedEmbed(newGuild: Guild, entry: AuditLogEntry | null): EmbedBuilder {
  const bannerUrl = newGuild.bannerURL({ size: 512 });
  const embed = new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('🎨 Server Banner Changed')
    .addFields({ name: '🔨 Changed By', value: executorField(entry), inline: false })
    .setTimestamp();
  if (bannerUrl) embed.setImage(bannerUrl);
  return embed;
}

export function buildServerVanityChangedEmbed(oldCode: string | null, newCode: string | null, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('🔖 Vanity URL Changed')
    .addFields(
      { name: '📋 Before', value: oldCode ? `discord.gg/${oldCode}` : '_none_', inline: true },
      { name: '📋 After',  value: newCode ? `discord.gg/${newCode}` : '_none_', inline: true },
      { name: '🔨 Changed By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildServerBoostLevelEmbed(oldTier: number, newTier: number): EmbedBuilder {
  const tierName = ['No Level', 'Level 1', 'Level 2', 'Level 3'];
  return new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle('🚀 Boost Level Changed')
    .addFields(
      { name: '📋 Before', value: tierName[oldTier] ?? `Tier ${oldTier}`, inline: true },
      { name: '📋 After',  value: tierName[newTier] ?? `Tier ${newTier}`, inline: true },
    )
    .setTimestamp();
}

// ── Emoji / Sticker ────────────────────────────────────────────────────────

export function buildEmojiCreatedEmbed(emoji: GuildEmoji, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('😊 Emoji Created')
    .addFields(
      { name: '😊 Emoji', value: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}> \`:${emoji.name}:\``, inline: true },
      { name: '🆔 Emoji ID', value: emoji.id, inline: true },
      { name: '🔨 Created By', value: executorField(entry), inline: false },
    )
    .setThumbnail(emoji.url)
    .setTimestamp();
}

export function buildEmojiDeletedEmbed(emoji: GuildEmoji, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('😢 Emoji Deleted')
    .addFields(
      { name: '😢 Emoji', value: `:${emoji.name}: (ID: ${emoji.id})`, inline: true },
      { name: '🔨 Deleted By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildEmojiUpdatedEmbed(oldEmoji: GuildEmoji, newEmoji: GuildEmoji, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('😮 Emoji Updated')
    .addFields(
      { name: '😮 Emoji', value: `<${newEmoji.animated ? 'a' : ''}:${newEmoji.name}:${newEmoji.id}>`, inline: true },
      { name: '🆔 Emoji ID', value: newEmoji.id, inline: true },
      { name: '📋 Name', value: diffField(`:${oldEmoji.name}:`, `:${newEmoji.name}:`), inline: false },
      { name: '🔨 Updated By', value: executorField(entry), inline: false },
    )
    .setThumbnail(newEmoji.url)
    .setTimestamp();
}

export function buildStickerCreatedEmbed(sticker: Sticker, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎉 Sticker Created')
    .addFields(
      { name: '🎉 Sticker', value: `**${sticker.name}**`, inline: true },
      { name: '🆔 Sticker ID', value: sticker.id, inline: true },
      { name: '📝 Description', value: sticker.description || '_none_', inline: false },
      { name: '🔨 Created By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildStickerDeletedEmbed(sticker: Sticker, entry: AuditLogEntry | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('😥 Sticker Deleted')
    .addFields(
      { name: '😥 Sticker', value: `**${sticker.name}**`, inline: true },
      { name: '🆔 Sticker ID', value: sticker.id, inline: true },
      { name: '🔨 Deleted By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

export function buildStickerUpdatedEmbed(oldSticker: Sticker, newSticker: Sticker, entry: AuditLogEntry | null): EmbedBuilder {
  const changes: string[] = [];
  if (oldSticker.name !== newSticker.name) changes.push(`**Name:** ~~${oldSticker.name}~~ → ${newSticker.name}`);
  if (oldSticker.description !== newSticker.description) changes.push(`**Description:** ~~${oldSticker.description || 'none'}~~ → ${newSticker.description || 'none'}`);

  return new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('🎊 Sticker Updated')
    .addFields(
      { name: '🎊 Sticker', value: `**${newSticker.name}**`, inline: true },
      { name: '🆔 Sticker ID', value: newSticker.id, inline: true },
      { name: '📋 Changes', value: changes.length ? changes.join('\n') : '_No tracked changes_', inline: false },
      { name: '🔨 Updated By', value: executorField(entry), inline: false },
    )
    .setTimestamp();
}

// ── Sample / Test Embeds ───────────────────────────────────────────────────

export function buildSampleEmbed(type: LogType): EmbedBuilder {
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
    case 'message_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🗑️ Message Deleted').setDescription('Hey everyone! This is a test message that got deleted.')
        .addFields({ name: '👤 Author', value: '<@123> **TestUser**', inline: true }, { name: '📢 Channel', value: '<#789>', inline: true })
        .setTimestamp(now);
    case 'message_edited':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('✏️ Message Edited')
        .addFields({ name: '👤 Author', value: '<@123> **TestUser**', inline: true }, { name: '📢 Channel', value: '<#789>', inline: true }, { name: '🔗 Jump', value: '[Go to message](https://discord.com)', inline: true }, { name: '📝 Before', value: 'Original message content', inline: false }, { name: '📝 After', value: 'Edited message content', inline: false })
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
    case 'voice_server_mute':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🔕 Server Muted').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice **General Voice**', inline: true })
        .setTimestamp(now);
    case 'voice_server_unmute':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🔔 Server Unmuted').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_server_deafen':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🙉 Server Deafened').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_server_undeafen':
      return new EmbedBuilder().setColor(0x57f287).setTitle('👂 Server Undeafened').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_self_mute':
      return new EmbedBuilder().setColor(0x99aab5).setTitle('🤫 Self Muted').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_self_deafen':
      return new EmbedBuilder().setColor(0x99aab5).setTitle('🙈 Self Deafened').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_camera_on':
      return new EmbedBuilder().setColor(0x57f287).setTitle('📷 Camera On').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_camera_off':
      return new EmbedBuilder().setColor(0x99aab5).setTitle('📵 Camera Off').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_stream_start':
      return new EmbedBuilder().setColor(0x57f287).setTitle('📡 Stream Started').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'voice_stream_stop':
      return new EmbedBuilder().setColor(0x99aab5).setTitle('⏹️ Stream Stopped').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '📢 Channel', value: '#general-voice', inline: true })
        .setTimestamp(now);
    case 'role_given':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🟢 Role Given').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '🎭 Role', value: '@Member **Member**', inline: true }, { name: '🔨 By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'role_removed':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🔴 Role Removed').setDescription('<@123> **TestUser**')
        .addFields({ name: '🆔 User ID', value: fakeId, inline: true }, { name: '🎭 Role', value: '@Member **Member**', inline: true }, { name: '🔨 By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'temp_role_added':
      return new EmbedBuilder().setColor(0x5865f2).setTitle('⏳ Temporary Role Added')
        .setDescription('<@123> **TestUser** has been given a temporary role.')
        .addFields(
          { name: '🎭 Role',        value: '<@&789> **Booster**',   inline: true  },
          { name: '👤 User',        value: '<@123> **TestUser**',   inline: true  },
          { name: '🔨 Moderator',   value: '<@456> **AdminUser**',  inline: false },
          { name: '⏱️ Duration',     value: '`24 hours`',            inline: true  },
          { name: '📅 Expires At',  value: `<t:${Math.floor((now.getTime() + 86400000) / 1000)}:F>`, inline: true },
          { name: '🕐 Case Time',   value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: false },
        )
        .setFooter({ text: `User ID: ${fakeId} · Role ID: ${fakeId}` })
        .setTimestamp(now);
    case 'temp_role_expired':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('⌛ Temporary Role Expired')
        .setDescription('<@123> **TestUser** had a temporary role that has now expired.')
        .addFields(
          { name: '🎭 Role',              value: '<@&789> **Booster**', inline: true  },
          { name: '👤 User',              value: '<@123> **TestUser**', inline: true  },
          { name: '⏱️ Original Duration', value: '`24 hours`',          inline: true  },
          { name: '📅 Expired At',        value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: true },
          { name: '📋 Reason',            value: 'Temporary role expired automatically.', inline: false },
        )
        .setFooter({ text: `User ID: ${fakeId} · Role ID: ${fakeId}` })
        .setTimestamp(now);
    case 'role_created':
      return new EmbedBuilder().setColor(0x57f287).setTitle('➕ Role Created')
        .addFields({ name: '🎭 Role', value: '@TestRole **TestRole**', inline: true }, { name: '🆔 Role ID', value: fakeId, inline: true }, { name: '🎨 Color', value: '#57f287', inline: true }, { name: '🔨 Created By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'role_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('➖ Role Deleted')
        .addFields({ name: '🎭 Role', value: '**TestRole**', inline: true }, { name: '🆔 Role ID', value: fakeId, inline: true }, { name: '🔨 Deleted By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'role_updated':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('📝 Role Updated')
        .addFields({ name: '🎭 Role', value: '@TestRole', inline: true }, { name: '🆔 Role ID', value: fakeId, inline: true }, { name: '📋 Changes', value: '**Name:** ~~OldRole~~ → TestRole', inline: false }, { name: '🔨 Updated By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'role_permissions_updated':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🔐 Role Permissions Updated')
        .addFields({ name: '🎭 Role', value: '@TestRole', inline: true }, { name: '✅ Granted', value: '`MANAGE_MESSAGES`', inline: false }, { name: '❌ Revoked', value: '`ADMINISTRATOR`', inline: false }, { name: '🔨 Updated By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'channel_created':
      return new EmbedBuilder().setColor(0x57f287).setTitle('📢 Channel Created')
        .addFields({ name: '📢 Channel', value: '<#789> **#test-channel**', inline: true }, { name: '🆔 Channel ID', value: fakeId, inline: true }, { name: '📁 Type', value: '0', inline: true }, { name: '🔨 Created By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'channel_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🗑️ Channel Deleted')
        .addFields({ name: '📢 Channel', value: '**#deleted-channel**', inline: true }, { name: '🆔 Channel ID', value: fakeId, inline: true }, { name: '🔨 Deleted By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'channel_updated':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('⚙️ Channel Updated')
        .addFields({ name: '📢 Channel', value: '<#789> **#test-channel**', inline: true }, { name: '📋 Changes', value: '**Name:** ~~old-channel~~ → test-channel', inline: false }, { name: '🔨 Updated By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'invite_created':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🔗 Invite Created')
        .addFields({ name: '🔑 Code', value: '`AbCdEf`', inline: true }, { name: '📢 Channel', value: '<#789>', inline: true }, { name: '👤 Created By', value: '<@456> **AdminUser**', inline: false }, { name: '♾️ Max Uses', value: '10', inline: true }, { name: '⏰ Expires', value: fakeTs, inline: true })
        .setTimestamp(now);
    case 'invite_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Invite Deleted')
        .addFields({ name: '🔑 Code', value: '`AbCdEf`', inline: true }, { name: '📢 Channel', value: '<#789>', inline: true }, { name: '📊 Uses', value: '5', inline: true })
        .setTimestamp(now);
    case 'server_name_changed':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🏷️ Server Name Changed')
        .addFields({ name: '📋 Before', value: 'Old Server Name', inline: true }, { name: '📋 After', value: 'New Server Name', inline: true }, { name: '🔨 Changed By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'server_icon_changed':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🖼️ Server Icon Changed')
        .addFields({ name: '🔨 Changed By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'server_banner_changed':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🎨 Server Banner Changed')
        .addFields({ name: '🔨 Changed By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'server_vanity_changed':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🔖 Vanity URL Changed')
        .addFields({ name: '📋 Before', value: 'discord.gg/old', inline: true }, { name: '📋 After', value: 'discord.gg/new', inline: true }, { name: '🔨 Changed By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'server_boost_level':
      return new EmbedBuilder().setColor(0xf47fff).setTitle('🚀 Boost Level Changed')
        .addFields({ name: '📋 Before', value: 'No Level', inline: true }, { name: '📋 After', value: 'Level 1', inline: true })
        .setTimestamp(now);
    case 'emoji_created':
      return new EmbedBuilder().setColor(0x57f287).setTitle('😊 Emoji Created')
        .addFields({ name: '😊 Emoji', value: '`:test_emoji:`', inline: true }, { name: '🆔 Emoji ID', value: fakeId, inline: true }, { name: '🔨 Created By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'emoji_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('😢 Emoji Deleted')
        .addFields({ name: '😢 Emoji', value: '`:test_emoji:`', inline: true }, { name: '🔨 Deleted By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'emoji_updated':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('😮 Emoji Updated')
        .addFields({ name: '😮 Emoji', value: '`:new_name:`', inline: true }, { name: '📋 Name', value: '~~:old_name:~~ → :new_name:', inline: false }, { name: '🔨 Updated By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'sticker_created':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🎉 Sticker Created')
        .addFields({ name: '🎉 Sticker', value: '**TestSticker**', inline: true }, { name: '🆔 Sticker ID', value: fakeId, inline: true }, { name: '🔨 Created By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'sticker_deleted':
      return new EmbedBuilder().setColor(0xed4245).setTitle('😥 Sticker Deleted')
        .addFields({ name: '😥 Sticker', value: '**TestSticker**', inline: true }, { name: '🆔 Sticker ID', value: fakeId, inline: true }, { name: '🔨 Deleted By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    case 'sticker_updated':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🎊 Sticker Updated')
        .addFields({ name: '🎊 Sticker', value: '**TestSticker**', inline: true }, { name: '📋 Changes', value: '**Name:** ~~OldSticker~~ → TestSticker', inline: false }, { name: '🔨 Updated By', value: '<@456> **AdminUser**', inline: false })
        .setTimestamp(now);
    // Moderation System Pro samples
    case 'mod_warn':
      return new EmbedBuilder().setColor(0xfee75c).setTitle('⚠️ Warning Issued')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📋 Case', value: '`MOD-0001`', inline: false }, { name: '📝 Reason', value: 'Breaking server rules', inline: false }, { name: '⚠️ Warning Count', value: 'User now has **1** active warning(s)', inline: true })
        .setFooter({ text: 'Case MOD-0001' }).setTimestamp(now);
    case 'mod_mute':
      return new EmbedBuilder().setColor(0xf5a623).setTitle('🔇 Member Muted')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📋 Case', value: '`MOD-0002`', inline: false }, { name: '📝 Reason', value: 'Disruptive behaviour', inline: false }, { name: '⏱️ Duration', value: `1h (expires ${fakeTs})`, inline: true })
        .setFooter({ text: 'Case MOD-0002' }).setTimestamp(now);
    case 'mod_unmute':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🔊 Member Unmuted')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📝 Reason', value: 'Timeout removed manually', inline: false })
        .setFooter({ text: 'Case MOD-0003' }).setTimestamp(now);
    case 'mod_kick':
      return new EmbedBuilder().setColor(0xe67e22).setTitle('👢 Member Kicked')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📝 Reason', value: 'Warned multiple times', inline: false })
        .setFooter({ text: 'Case MOD-0004' }).setTimestamp(now);
    case 'mod_ban':
      return new EmbedBuilder().setColor(0xed4245).setTitle('🔨 Member Banned')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📝 Reason', value: 'Severe rule violation', inline: false })
        .setFooter({ text: 'Case MOD-0005' }).setTimestamp(now);
    case 'mod_unban':
      return new EmbedBuilder().setColor(0x57f287).setTitle('🔓 Member Unbanned')
        .addFields({ name: '👤 User', value: 'TestUser\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📝 Reason', value: 'Appeal accepted', inline: false })
        .setFooter({ text: 'Case MOD-0006' }).setTimestamp(now);
    case 'mod_softban':
      return new EmbedBuilder().setColor(0xe67e22).setTitle('🧹 Member Softbanned')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📝 Reason', value: 'Message history clean-up', inline: false })
        .setFooter({ text: 'Case MOD-0007' }).setTimestamp(now);
    case 'mod_tempban':
      return new EmbedBuilder().setColor(0xed4245).setTitle('⏳ Temporary Ban')
        .addFields({ name: '👤 User', value: '<@123> (TestUser)\nID: `123456789012345678`', inline: true }, { name: '🛡️ Moderator', value: '<@456> (AdminUser)', inline: true }, { name: '📝 Reason', value: 'Temporary removal', inline: false }, { name: '⏱️ Duration', value: `7d (expires ${fakeTs})`, inline: true })
        .setFooter({ text: 'Case MOD-0008' }).setTimestamp(now);
    default:
      return new EmbedBuilder().setColor(0x99aab5).setTitle('📋 Log Sample').setDescription('This is a sample log embed.').setTimestamp(now);
  }
}
