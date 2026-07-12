import {
  AuditLogEvent,
  type GuildBan,
  type GuildMember,
  type PartialGuildMember,
  type Role,
  type Message,
  type PartialMessage,
  type VoiceState,
  type TextChannel,
  type Guild,
  type GuildChannel,
  type GuildEmoji,
  type Sticker,
  type Invite,
  type EmbedBuilder,
  type GuildAuditLogsEntry,
} from 'discord.js';
type AuditLogEntry = GuildAuditLogsEntry;
import { resolveLogConfig, type ResolvedLogConfig } from './log-store';
import {
  buildInviteInEmbed,
  buildInviteOutEmbed,
  buildVerificationEmbed,
  buildTimeoutEmbed,
  buildKickEmbed,
  buildBanEmbed,
  buildVoiceJoinEmbed,
  buildVoiceLeaveEmbed,
  buildVoiceMoveEmbed,
  buildVoiceServerMuteEmbed,
  buildVoiceServerUnmuteEmbed,
  buildVoiceServerDeafenEmbed,
  buildVoiceServerUndeafenEmbed,
  buildVoiceSelfMuteEmbed,
  buildVoiceSelfDeafenEmbed,
  buildVoiceCameraOnEmbed,
  buildVoiceCameraOffEmbed,
  buildVoiceStreamStartEmbed,
  buildVoiceStreamStopEmbed,
  buildRoleGivenEmbed,
  buildRoleRemovedEmbed,
  buildRoleCreatedEmbed,
  buildRoleDeletedEmbed,
  buildRoleUpdatedEmbed,
  buildRolePermissionsUpdatedEmbed,
  buildChannelCreatedEmbed,
  buildChannelDeletedEmbed,
  buildChannelUpdatedEmbed,
  buildInviteCreatedEmbed,
  buildInviteDeletedEmbed,
  buildMessageDeletedEmbed,
  buildMessageEditedEmbed,
  buildServerNameChangedEmbed,
  buildServerIconChangedEmbed,
  buildServerBannerChangedEmbed,
  buildServerVanityChangedEmbed,
  buildServerBoostLevelEmbed,
  buildEmojiCreatedEmbed,
  buildEmojiDeletedEmbed,
  buildEmojiUpdatedEmbed,
  buildStickerCreatedEmbed,
  buildStickerDeletedEmbed,
  buildStickerUpdatedEmbed,
} from './log-renderer';
import { logger } from '../../utils/logger';

// ── Helpers ────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch the most recent matching audit log entry, with up to `retries` retries
 * (with a short delay between each) to handle Discord propagation lag.
 */
async function fetchAuditEntry(
  guild: Guild,
  event: AuditLogEvent,
  targetId: string,
  windowMs = 10_000,
  retries = 3,
): Promise<AuditLogEntry | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await wait(1_000);
    try {
      const logs = await guild.fetchAuditLogs({ type: event, limit: 5 });
      const entry = logs.entries.find(e =>
        (e.target as { id?: string } | null)?.id === targetId &&
        Date.now() - e.createdTimestamp < windowMs,
      );
      if (entry) return entry;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Send an embed to the configured channel, applying color overrides and mentions.
 */
async function sendLog(
  guild: Guild,
  lcfg: ResolvedLogConfig,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    // Apply per-type color override
    if (lcfg.color !== undefined) embed.setColor(lcfg.color);

    const ch = await guild.channels.fetch(lcfg.channelId).catch(() => null);
    if (!ch?.isTextBased()) return;

    const mentions = lcfg.mentionRoles?.map(id => `<@&${id}>`).join(' ') || undefined;
    await (ch as TextChannel).send({ content: mentions, embeds: [embed] });
  } catch (err) {
    logger.error(`[Logs] Failed to send log to channel ${lcfg.channelId}`, err);
  }
}

/** Returns true if this event should be suppressed based on the per-type ignore config. */
function shouldIgnore(
  lcfg: ResolvedLogConfig,
  opts: { userId?: string; roleIds?: string[]; isBot?: boolean },
): boolean {
  if (opts.isBot && lcfg.ignoreBots) return true;
  if (opts.userId && lcfg.ignoreUsers?.includes(opts.userId)) return true;
  if (opts.roleIds?.length && lcfg.ignoreRoles?.some(r => opts.roleIds!.includes(r))) return true;
  return false;
}

function memberRoles(member: GuildMember | PartialGuildMember): string[] {
  if ('roles' in member && member.roles && 'cache' in member.roles) {
    return [...(member as GuildMember).roles.cache.keys()];
  }
  return [];
}

// ── Service ────────────────────────────────────────────────────────────────

class ServerLogService {
  /** Track recently-banned IDs so member-leave doesn't double-log as invite_out. */
  private readonly recentBans = new Set<string>();

  // ── Membership ─────────────────────────────────────────────────────────────

  async onMemberJoin(member: GuildMember): Promise<void> {
    if (member.user.bot) {
      const lcfg = await resolveLogConfig(member.guild.id, 'invite_in');
      if (!lcfg || !lcfg.ignoreBots) {
        // Still log bot joins unless explicitly ignored
      } else return;
    }
    try {
      const lcfg = await resolveLogConfig(member.guild.id, 'invite_in');
      if (!lcfg) return;
      if (shouldIgnore(lcfg, { userId: member.id, roleIds: memberRoles(member), isBot: member.user.bot })) return;
      await sendLog(member.guild, lcfg, buildInviteInEmbed(member));
    } catch (err) {
      logger.error('[Logs] invite_in error', err);
    }
  }

  async onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    // If a ban fired within the last 5 seconds for this user, skip
    if (this.recentBans.has(member.id)) {
      this.recentBans.delete(member.id);
      return;
    }

    const guild = member.guild;
    await wait(1_500);

    try {
      const kickEntry = await fetchAuditEntry(guild, AuditLogEvent.MemberKick, member.id);
      if (kickEntry) {
        const lcfg = await resolveLogConfig(guild.id, 'kick');
        if (lcfg) {
          const execId = kickEntry.executor?.id;
          const execBot = kickEntry.executor?.bot ?? false;
          if (!shouldIgnore(lcfg, { userId: execId, isBot: execBot })) {
            await sendLog(guild, lcfg, buildKickEmbed(member, kickEntry));
          }
        }
        return;
      }
    } catch (err) {
      logger.error('[Logs] kick audit fetch error', err);
    }

    try {
      const lcfg = await resolveLogConfig(guild.id, 'invite_out');
      if (!lcfg) return;
      if (shouldIgnore(lcfg, { userId: member.id, roleIds: memberRoles(member), isBot: member.user?.bot ?? false })) return;
      await sendLog(guild, lcfg, buildInviteOutEmbed(member));
    } catch (err) {
      logger.error('[Logs] invite_out error', err);
    }
  }

  async onVerification(member: GuildMember): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(member.guild.id, 'verification');
      if (!lcfg) return;
      if (shouldIgnore(lcfg, { userId: member.id, roleIds: memberRoles(member), isBot: member.user.bot })) return;
      await sendLog(member.guild, lcfg, buildVerificationEmbed(member));
    } catch (err) {
      logger.error('[Logs] verification error', err);
    }
  }

  // ── Ban ────────────────────────────────────────────────────────────────────

  async onBanAdd(ban: GuildBan): Promise<void> {
    this.recentBans.add(ban.user.id);
    setTimeout(() => this.recentBans.delete(ban.user.id), 10_000);

    try {
      const lcfg = await resolveLogConfig(ban.guild.id, 'ban');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      const execId = entry?.executor?.id;
      const execBot = entry?.executor?.bot ?? false;
      if (shouldIgnore(lcfg, { userId: execId, isBot: execBot })) return;
      await sendLog(ban.guild, lcfg, buildBanEmbed(ban.user, entry));
    } catch (err) {
      logger.error('[Logs] ban error', err);
    }
  }

  // ── Member Update (Timeout + Role Changes) ─────────────────────────────────

  async onMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    const guild = newMember.guild;

    // ── Timeout ─────────────────────────────────────────────────────────────
    const wasTimedOut = 'isCommunicationDisabled' in oldMember
      ? oldMember.isCommunicationDisabled()
      : false;
    const isTimedOut = newMember.isCommunicationDisabled();

    if (!wasTimedOut && isTimedOut) {
      try {
        const lcfg = await resolveLogConfig(guild.id, 'timeout');
        if (lcfg) {
          await wait(500);
          const entry = await fetchAuditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id);
          if (!shouldIgnore(lcfg, { userId: newMember.id, roleIds: memberRoles(newMember), isBot: newMember.user.bot })) {
            await sendLog(guild, lcfg, buildTimeoutEmbed(newMember, entry));
          }
        }
      } catch (err) {
        logger.error('[Logs] timeout error', err);
      }
    }

    // ── Role Changes ─────────────────────────────────────────────────────────
    const hadRoles = 'roles' in oldMember && oldMember.roles && 'cache' in oldMember.roles;
    if (!hadRoles) return;

    const oldRoles = (oldMember as GuildMember).roles.cache;
    const newRoles = newMember.roles.cache;
    const added   = newRoles.filter(r => !oldRoles.has(r.id) && r.id !== guild.id);
    const removed = oldRoles.filter(r => !newRoles.has(r.id) && r.id !== guild.id);
    if (added.size === 0 && removed.size === 0) return;

    let roleAuditEntry: AuditLogEntry | null = null;
    try {
      await wait(500);
      roleAuditEntry = await fetchAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, 6_000);
    } catch { /* non-fatal */ }

    const newRoleIds = [...newRoles.keys()];

    for (const [, role] of added) {
      try {
        const lcfg = await resolveLogConfig(guild.id, 'role_given');
        if (lcfg && !shouldIgnore(lcfg, { userId: newMember.id, roleIds: newRoleIds, isBot: newMember.user.bot })) {
          await sendLog(guild, lcfg, buildRoleGivenEmbed(newMember, role, roleAuditEntry));
        }
      } catch (err) {
        logger.error('[Logs] role_given error', err);
      }
    }

    for (const [, role] of removed) {
      try {
        const lcfg = await resolveLogConfig(guild.id, 'role_removed');
        if (lcfg && !shouldIgnore(lcfg, { userId: newMember.id, roleIds: newRoleIds, isBot: newMember.user.bot })) {
          await sendLog(guild, lcfg, buildRoleRemovedEmbed(newMember, role, roleAuditEntry));
        }
      } catch (err) {
        logger.error('[Logs] role_removed error', err);
      }
    }
  }

  // ── Voice State ────────────────────────────────────────────────────────────

  async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member ?? oldState.member;
    const guild  = newState.guild;
    const userId = member?.id ?? newState.id;
    const roleIds = member ? [...member.roles.cache.keys()] : [];
    const isBot  = member?.user.bot ?? false;

    const channelChanged = oldState.channelId !== newState.channelId;

    if (channelChanged) {
      // ── Join / Leave / Move ──────────────────────────────────────────────
      if (!oldState.channelId && newState.channelId) {
        const lcfg = await resolveLogConfig(guild.id, 'voice_join');
        if (lcfg && !shouldIgnore(lcfg, { userId, roleIds, isBot })) {
          await sendLog(guild, lcfg, buildVoiceJoinEmbed(newState));
        }
      } else if (oldState.channelId && !newState.channelId) {
        const lcfg = await resolveLogConfig(guild.id, 'voice_leave');
        if (lcfg && !shouldIgnore(lcfg, { userId, roleIds, isBot })) {
          await sendLog(guild, lcfg, buildVoiceLeaveEmbed(oldState));
        }
      } else if (oldState.channelId && newState.channelId) {
        const lcfg = await resolveLogConfig(guild.id, 'voice_move');
        if (lcfg && !shouldIgnore(lcfg, { userId, roleIds, isBot })) {
          await sendLog(guild, lcfg, buildVoiceMoveEmbed(oldState, newState));
        }
      }
    } else if (newState.channelId) {
      // Same channel — detect state changes
      await this.handleVoiceStateChanges(guild, oldState, newState, { userId, roleIds, isBot });
    }
  }

  private async handleVoiceStateChanges(
    guild: Guild,
    old: VoiceState,
    now: VoiceState,
    who: { userId: string; roleIds: string[]; isBot: boolean },
  ): Promise<void> {
    const builderMap: Partial<Record<import('./log-store').LogType, (s: VoiceState) => EmbedBuilder>> = {
      voice_server_mute:    buildVoiceServerMuteEmbed,
      voice_server_unmute:  buildVoiceServerUnmuteEmbed,
      voice_server_deafen:  buildVoiceServerDeafenEmbed,
      voice_server_undeafen:buildVoiceServerUndeafenEmbed,
      voice_self_mute:      buildVoiceSelfMuteEmbed,
      voice_self_deafen:    buildVoiceSelfDeafenEmbed,
      voice_camera_on:      buildVoiceCameraOnEmbed,
      voice_camera_off:     buildVoiceCameraOffEmbed,
      voice_stream_start:   buildVoiceStreamStartEmbed,
      voice_stream_stop:    buildVoiceStreamStopEmbed,
    };

    const events: { type: import('./log-store').LogType; state: VoiceState }[] = [];
    if (!old.serverMute && !!now.serverMute)  events.push({ type: 'voice_server_mute',    state: now });
    if (!!old.serverMute && !now.serverMute)  events.push({ type: 'voice_server_unmute',  state: now });
    if (!old.serverDeaf && !!now.serverDeaf)  events.push({ type: 'voice_server_deafen',  state: now });
    if (!!old.serverDeaf && !now.serverDeaf)  events.push({ type: 'voice_server_undeafen',state: now });
    if (!old.selfMute && now.selfMute)        events.push({ type: 'voice_self_mute',       state: now });
    if (!old.selfDeaf && now.selfDeaf)        events.push({ type: 'voice_self_deafen',     state: now });
    if (!old.selfVideo && now.selfVideo)      events.push({ type: 'voice_camera_on',       state: now });
    if (old.selfVideo && !now.selfVideo)      events.push({ type: 'voice_camera_off',      state: now });
    if (!old.streaming && now.streaming)      events.push({ type: 'voice_stream_start',    state: now });
    if (old.streaming && !now.streaming)      events.push({ type: 'voice_stream_stop',     state: now });

    for (const { type, state } of events) {
      try {
        const lcfg = await resolveLogConfig(guild.id, type);
        if (!lcfg || shouldIgnore(lcfg, who)) continue;
        const builder = builderMap[type];
        if (builder) await sendLog(guild, lcfg, builder(state));
      } catch (err) {
        logger.error(`[Logs] ${type} error`, err);
      }
    }
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild || message.author?.bot) return;
    try {
      const lcfg = await resolveLogConfig(message.guild.id, 'message_deleted');
      if (!lcfg) return;
      if (shouldIgnore(lcfg, { userId: message.author?.id, isBot: message.author?.bot ?? false })) return;
      await sendLog(message.guild, lcfg, buildMessageDeletedEmbed(message));
    } catch (err) {
      logger.error('[Logs] message_deleted error', err);
    }
  }

  async onMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
    if (!newMessage.guild || newMessage.author?.bot) return;
    // Ignore embed-only updates (Discord populates link previews after the fact)
    if (oldMessage.content === newMessage.content) return;
    try {
      const lcfg = await resolveLogConfig(newMessage.guild.id, 'message_edited');
      if (!lcfg) return;
      if (shouldIgnore(lcfg, { userId: newMessage.author?.id, isBot: newMessage.author?.bot ?? false })) return;
      await sendLog(newMessage.guild, lcfg, buildMessageEditedEmbed(oldMessage, newMessage));
    } catch (err) {
      logger.error('[Logs] message_edited error', err);
    }
  }

  // ── Roles (server-level) ───────────────────────────────────────────────────

  async onRoleCreate(role: Role): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(role.guild.id, 'role_created');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(role.guild, lcfg, buildRoleCreatedEmbed(role, entry));
    } catch (err) {
      logger.error('[Logs] role_created error', err);
    }
  }

  async onRoleDelete(role: Role): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(role.guild.id, 'role_deleted');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(role.guild, lcfg, buildRoleDeletedEmbed(role, entry));
    } catch (err) {
      logger.error('[Logs] role_deleted error', err);
    }
  }

  async onRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
    const permissionsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
    const otherChanged = oldRole.name !== newRole.name || oldRole.hexColor !== newRole.hexColor ||
      oldRole.hoist !== newRole.hoist || oldRole.mentionable !== newRole.mentionable;

    if (!permissionsChanged && !otherChanged) return;

    try {
      await wait(500);
      const entry = await fetchAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

      if (permissionsChanged) {
        const lcfg = await resolveLogConfig(newRole.guild.id, 'role_permissions_updated');
        if (lcfg && !(entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false }))) {
          await sendLog(newRole.guild, lcfg, buildRolePermissionsUpdatedEmbed(oldRole, newRole, entry));
        }
      }

      if (otherChanged) {
        const lcfg = await resolveLogConfig(newRole.guild.id, 'role_updated');
        if (lcfg && !(entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false }))) {
          await sendLog(newRole.guild, lcfg, buildRoleUpdatedEmbed(oldRole, newRole, entry));
        }
      }
    } catch (err) {
      logger.error('[Logs] role_updated error', err);
    }
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  async onChannelCreate(channel: GuildChannel): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(channel.guild.id, 'channel_created');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(channel.guild, lcfg, buildChannelCreatedEmbed(channel, entry));
    } catch (err) {
      logger.error('[Logs] channel_created error', err);
    }
  }

  async onChannelDelete(channel: GuildChannel): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(channel.guild.id, 'channel_deleted');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(channel.guild, lcfg, buildChannelDeletedEmbed(channel, entry));
    } catch (err) {
      logger.error('[Logs] channel_deleted error', err);
    }
  }

  async onChannelUpdate(oldChannel: GuildChannel, newChannel: GuildChannel): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(newChannel.guild.id, 'channel_updated');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(newChannel.guild, lcfg, buildChannelUpdatedEmbed(oldChannel, newChannel, entry));
    } catch (err) {
      logger.error('[Logs] channel_updated error', err);
    }
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  async onInviteCreate(invite: Invite): Promise<void> {
    if (!invite.guild) return;
    try {
      const lcfg = await resolveLogConfig(invite.guild.id, 'invite_created');
      if (!lcfg) return;
      if (invite.inviter && shouldIgnore(lcfg, { userId: invite.inviter.id, isBot: invite.inviter.bot })) return;
      await sendLog(invite.guild as Guild, lcfg, buildInviteCreatedEmbed(invite));
    } catch (err) {
      logger.error('[Logs] invite_created error', err);
    }
  }

  async onInviteDelete(invite: Invite): Promise<void> {
    if (!invite.guild) return;
    try {
      const lcfg = await resolveLogConfig(invite.guild.id, 'invite_deleted');
      if (!lcfg) return;
      if (invite.inviter && shouldIgnore(lcfg, { userId: invite.inviter.id, isBot: invite.inviter.bot })) return;
      await sendLog(invite.guild as Guild, lcfg, buildInviteDeletedEmbed(invite));
    } catch (err) {
      logger.error('[Logs] invite_deleted error', err);
    }
  }

  // ── Server (Guild) Changes ─────────────────────────────────────────────────

  async onGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
    try {
      await wait(500);
      const entry = await fetchAuditEntry(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
      const execId  = entry?.executor?.id;
      const execBot = entry?.executor?.bot ?? false;

      const fire = async (
        type: import('./log-store').LogType,
        builder: () => EmbedBuilder,
      ): Promise<void> => {
        const lcfg = await resolveLogConfig(newGuild.id, type);
        if (!lcfg) return;
        if (entry && shouldIgnore(lcfg, { userId: execId, isBot: execBot })) return;
        await sendLog(newGuild, lcfg, builder());
      };

      if (oldGuild.name !== newGuild.name) {
        await fire('server_name_changed', () => buildServerNameChangedEmbed(oldGuild, newGuild, entry));
      }
      if (oldGuild.icon !== newGuild.icon) {
        await fire('server_icon_changed', () => buildServerIconChangedEmbed(newGuild, entry));
      }
      if (oldGuild.banner !== newGuild.banner) {
        await fire('server_banner_changed', () => buildServerBannerChangedEmbed(newGuild, entry));
      }
      if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        await fire('server_vanity_changed', () => buildServerVanityChangedEmbed(oldGuild.vanityURLCode, newGuild.vanityURLCode, entry));
      }
      if (oldGuild.premiumTier !== newGuild.premiumTier) {
        await fire('server_boost_level', () => buildServerBoostLevelEmbed(oldGuild.premiumTier, newGuild.premiumTier));
      }
    } catch (err) {
      logger.error('[Logs] guild_update error', err);
    }
  }

  // ── Emojis & Stickers ──────────────────────────────────────────────────────

  async onEmojiCreate(emoji: GuildEmoji): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(emoji.guild.id, 'emoji_created');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(emoji.guild, lcfg, buildEmojiCreatedEmbed(emoji, entry));
    } catch (err) {
      logger.error('[Logs] emoji_created error', err);
    }
  }

  async onEmojiDelete(emoji: GuildEmoji): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(emoji.guild.id, 'emoji_deleted');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(emoji.guild, lcfg, buildEmojiDeletedEmbed(emoji, entry));
    } catch (err) {
      logger.error('[Logs] emoji_deleted error', err);
    }
  }

  async onEmojiUpdate(oldEmoji: GuildEmoji, newEmoji: GuildEmoji): Promise<void> {
    if (oldEmoji.name === newEmoji.name) return;
    try {
      const lcfg = await resolveLogConfig(newEmoji.guild.id, 'emoji_updated');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(newEmoji.guild, lcfg, buildEmojiUpdatedEmbed(oldEmoji, newEmoji, entry));
    } catch (err) {
      logger.error('[Logs] emoji_updated error', err);
    }
  }

  async onStickerCreate(sticker: Sticker): Promise<void> {
    if (!sticker.guildId) return;
    try {
      const guild = sticker.guild;
      if (!guild) return;
      const lcfg = await resolveLogConfig(sticker.guildId, 'sticker_created');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(guild, AuditLogEvent.StickerCreate, sticker.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(guild, lcfg, buildStickerCreatedEmbed(sticker, entry));
    } catch (err) {
      logger.error('[Logs] sticker_created error', err);
    }
  }

  async onStickerDelete(sticker: Sticker): Promise<void> {
    if (!sticker.guildId) return;
    try {
      const guild = sticker.guild;
      if (!guild) return;
      const lcfg = await resolveLogConfig(sticker.guildId, 'sticker_deleted');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(guild, AuditLogEvent.StickerDelete, sticker.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(guild, lcfg, buildStickerDeletedEmbed(sticker, entry));
    } catch (err) {
      logger.error('[Logs] sticker_deleted error', err);
    }
  }

  async onStickerUpdate(oldSticker: Sticker, newSticker: Sticker): Promise<void> {
    if (!newSticker.guildId) return;
    if (oldSticker.name === newSticker.name && oldSticker.description === newSticker.description) return;
    try {
      const guild = newSticker.guild;
      if (!guild) return;
      const lcfg = await resolveLogConfig(newSticker.guildId, 'sticker_updated');
      if (!lcfg) return;
      await wait(500);
      const entry = await fetchAuditEntry(guild, AuditLogEvent.StickerUpdate, newSticker.id);
      if (entry && shouldIgnore(lcfg, { userId: entry.executor?.id, isBot: entry.executor?.bot ?? false })) return;
      await sendLog(guild, lcfg, buildStickerUpdatedEmbed(oldSticker, newSticker, entry));
    } catch (err) {
      logger.error('[Logs] sticker_updated error', err);
    }
  }
}

export const serverLogService = new ServerLogService();
