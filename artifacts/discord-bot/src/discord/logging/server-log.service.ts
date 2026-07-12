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
  type EmbedBuilder,
  type AuditLogEntry,
} from 'discord.js';
import { resolveLogChannel } from './log-store';
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
  buildRoleGivenEmbed,
  buildRoleRemovedEmbed,
  buildMessageDeletedEmbed,
} from './log-renderer';
import { logger } from '../../utils/logger';

// ── Helpers ────────────────────────────────────────────────────────────────

async function sendLog(guild: Guild, channelId: string, embed: EmbedBuilder): Promise<void> {
  try {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send({ embeds: [embed] });
  } catch (err) {
    logger.error(`[Logs] Failed to send log to channel ${channelId}`, err);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAuditEntry(
  guild: Guild,
  event: AuditLogEvent,
  targetId: string,
  windowMs = 10_000,
): Promise<AuditLogEntry | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type: event, limit: 5 });
    return logs.entries.find(e =>
      (e.target as { id?: string } | null)?.id === targetId &&
      Date.now() - e.createdTimestamp < windowMs,
    ) ?? null;
  } catch {
    return null;
  }
}

// ── Service ────────────────────────────────────────────────────────────────

class ServerLogService {
  /** Track recently-banned IDs so member-leave doesn't double-log as invite_out. */
  private readonly recentBans = new Set<string>();

  // ── Invite In ─────────────────────────────────────────────────────────────

  async onMemberJoin(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    try {
      const channelId = await resolveLogChannel(member.guild.id, 'invite_in');
      if (!channelId) return;
      await sendLog(member.guild, channelId, buildInviteInEmbed(member));
    } catch (err) {
      logger.error('[Logs] invite_in error', err);
    }
  }

  // ── Invite Out (+ Kick detection) ──────────────────────────────────────────

  async onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    if (member.user?.bot) return;

    // If a ban fired within the last 5 seconds for this user, skip — ban handler owns it
    if (this.recentBans.has(member.id)) {
      this.recentBans.delete(member.id);
      return;
    }

    const guild = member.guild;

    // Wait briefly for audit log to propagate, then detect kicks
    await wait(1_500);

    try {
      const kickEntry = await fetchAuditEntry(guild, AuditLogEvent.MemberKick, member.id);
      if (kickEntry) {
        const channelId = await resolveLogChannel(guild.id, 'kick');
        if (channelId) await sendLog(guild, channelId, buildKickEmbed(member, kickEntry));
        return;
      }
    } catch (err) {
      logger.error('[Logs] kick audit fetch error', err);
    }

    // Normal leave
    try {
      const channelId = await resolveLogChannel(guild.id, 'invite_out');
      if (!channelId) return;
      await sendLog(guild, channelId, buildInviteOutEmbed(member));
    } catch (err) {
      logger.error('[Logs] invite_out error', err);
    }
  }

  // ── Verification ──────────────────────────────────────────────────────────

  async onVerification(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    try {
      const channelId = await resolveLogChannel(member.guild.id, 'verification');
      if (!channelId) return;
      await sendLog(member.guild, channelId, buildVerificationEmbed(member));
    } catch (err) {
      logger.error('[Logs] verification error', err);
    }
  }

  // ── Ban ───────────────────────────────────────────────────────────────────

  async onBanAdd(ban: GuildBan): Promise<void> {
    if (ban.user.bot) return;
    this.recentBans.add(ban.user.id);
    setTimeout(() => this.recentBans.delete(ban.user.id), 10_000);

    try {
      const channelId = await resolveLogChannel(ban.guild.id, 'ban');
      if (!channelId) return;
      await wait(500);
      const entry = await fetchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      await sendLog(ban.guild, channelId, buildBanEmbed(ban.user, entry));
    } catch (err) {
      logger.error('[Logs] ban error', err);
    }
  }

  // ── Timeout + Role changes ────────────────────────────────────────────────

  async onMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    if (newMember.user.bot) return;
    const guild = newMember.guild;

    // ── Timeout detection ─────────────────────────────────────────────────
    const wasTimedOut = 'isCommunicationDisabled' in oldMember
      ? oldMember.isCommunicationDisabled()
      : false;
    const isTimedOut = newMember.isCommunicationDisabled();

    if (!wasTimedOut && isTimedOut) {
      try {
        const channelId = await resolveLogChannel(guild.id, 'timeout');
        if (channelId) {
          await wait(500);
          const entry = await fetchAuditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id);
          await sendLog(guild, channelId, buildTimeoutEmbed(newMember, entry));
        }
      } catch (err) {
        logger.error('[Logs] timeout error', err);
      }
    }

    // ── Role changes ──────────────────────────────────────────────────────
    const hadRoles = 'roles' in oldMember && oldMember.roles && 'cache' in oldMember.roles;
    if (!hadRoles) return;

    const oldRoles = (oldMember as GuildMember).roles.cache;
    const newRoles = newMember.roles.cache;

    const added   = newRoles.filter(r => !oldRoles.has(r.id) && r.id !== guild.id);
    const removed = oldRoles.filter(r => !newRoles.has(r.id) && r.id !== guild.id);

    if (added.size === 0 && removed.size === 0) return;

    // Fetch audit log once for all role changes in this update
    let roleAuditEntry: AuditLogEntry | null = null;
    try {
      await wait(500);
      roleAuditEntry = await fetchAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, 6_000);
    } catch { /* non-fatal */ }

    for (const [, role] of added) {
      try {
        const channelId = await resolveLogChannel(guild.id, 'role_given');
        if (channelId) await sendLog(guild, channelId, buildRoleGivenEmbed(newMember, role, roleAuditEntry));
      } catch (err) {
        logger.error('[Logs] role_given error', err);
      }
    }

    for (const [, role] of removed) {
      try {
        const channelId = await resolveLogChannel(guild.id, 'role_removed');
        if (channelId) await sendLog(guild, channelId, buildRoleRemovedEmbed(newMember, role, roleAuditEntry));
      } catch (err) {
        logger.error('[Logs] role_removed error', err);
      }
    }
  }

  // ── Voice State ───────────────────────────────────────────────────────────

  async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member ?? oldState.member;
    if (member?.user.bot) return;
    const guild = newState.guild;

    try {
      if (!oldState.channelId && newState.channelId) {
        const channelId = await resolveLogChannel(guild.id, 'voice_join');
        if (channelId) await sendLog(guild, channelId, buildVoiceJoinEmbed(newState));
      } else if (oldState.channelId && !newState.channelId) {
        const channelId = await resolveLogChannel(guild.id, 'voice_leave');
        if (channelId) await sendLog(guild, channelId, buildVoiceLeaveEmbed(oldState));
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const channelId = await resolveLogChannel(guild.id, 'voice_move');
        if (channelId) await sendLog(guild, channelId, buildVoiceMoveEmbed(oldState, newState));
      }
    } catch (err) {
      logger.error('[Logs] voice error', err);
    }
  }

  // ── Message Deleted ───────────────────────────────────────────────────────

  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild || message.author?.bot) return;
    try {
      const channelId = await resolveLogChannel(message.guild.id, 'message_deleted');
      if (!channelId) return;
      await sendLog(message.guild, channelId, buildMessageDeletedEmbed(message));
    } catch (err) {
      logger.error('[Logs] message_deleted error', err);
    }
  }

  // ── Message Updated (kept for possible future re-enable) ─────────────────

  async onMessageUpdate(_oldMessage: Message | PartialMessage, _newMessage: Message | PartialMessage): Promise<void> {
    // No dedicated log type for message_edit in current spec — no-op
  }
}

export const serverLogService = new ServerLogService();
