import {
  EmbedBuilder,
  GuildMember,
  type Guild,
  type User,
  type TextChannel,
  PermissionFlagsBits,
} from 'discord.js';
import type { ModCase, ModerationAction } from './types';
import { parseDuration } from './types';
import { storeCase, getCase as _getCase, getUserCases, getActiveWarnCount, setCaseActive, clearUserWarnings } from './mod-store';
import { getGuildModConfig, allocateCaseId } from './mod-config-store';
import { buildCaseEmbed, buildDMEmbed, buildHistoryEmbed, buildAutoPunishEmbed } from './embeds';
import { resolveLogConfig } from '../../discord/logging/log-store';
import type { LogType } from '../../discord/logging/log-store';
import { expiryManager } from './expiry-manager';
import { staffEventBus } from '../staff/staff-events';
import { logger } from '../../utils/logger';

// ── Internal helpers ───────────────────────────────────────────────────────

const ACTION_TO_LOG: Partial<Record<ModerationAction, LogType>> = {
  warn:        'mod_warn',
  mute:        'mod_mute',
  temptimeout: 'mod_mute',
  unmute:      'mod_unmute',
  kick:        'mod_kick',
  ban:         'mod_ban',
  tempban:     'mod_tempban',
  softban:     'mod_softban',
  unban:       'mod_unban',
};

async function sendModLog(guild: Guild, action: ModerationAction, embed: EmbedBuilder): Promise<void> {
  const logType = ACTION_TO_LOG[action];
  if (!logType) return;
  try {
    const lcfg = await resolveLogConfig(guild.id, logType);
    if (!lcfg) return;
    const ch = await guild.channels.fetch(lcfg.channelId).catch(() => null);
    if (!ch?.isTextBased()) return;
    if (lcfg.color !== undefined) embed.setColor(lcfg.color);
    const mentions = lcfg.mentionRoles?.map(id => `<@&${id}>`).join(' ') || undefined;
    await (ch as TextChannel).send({ content: mentions, embeds: [embed] });
  } catch (err) {
    logger.error(`[Mod] Log emit failed for ${action}`, err);
  }
}

async function dmUser(user: User | GuildMember, c: ModCase, serverName: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const target = 'user' in user ? user.user : user;
  try {
    const embed = buildDMEmbed(c, serverName);
    await target.send({ embeds: [embed] });
  } catch { /* user has DMs disabled — not fatal */ }
}

/** Build a fresh ModCase, save it, return it with the active warn count. */
async function createCase(
  guild: Guild,
  mod: GuildMember,
  target: User | GuildMember,
  action: ModerationAction,
  reason: string,
  opts: { expiresAt?: number; extra?: Record<string, unknown> } = {},
): Promise<{ c: ModCase; warnCount: number }> {
  const targetUser = 'user' in target ? target.user : target as User;
  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: targetUser.id,
    targetTag: targetUser.tag ?? `${targetUser.username}`,
    moderatorId: mod.id,
    moderatorTag: mod.user.tag ?? `${mod.user.username}`,
    action,
    reason,
    timestamp: Date.now(),
    active: true,
    ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
    ...(opts.extra ? { extra: opts.extra } : {}),
  };
  await storeCase(c);
  const warnCount = action === 'warn'
    ? await getActiveWarnCount(guild.id, targetUser.id)
    : 0;
  return { c, warnCount };
}

// ── Permission checks ──────────────────────────────────────────────────────

export interface PermCheck {
  ok: boolean;
  reason?: string;
}

export async function checkModPermission(
  moderator: GuildMember,
  target: GuildMember | User,
  guild: Guild,
): Promise<PermCheck> {
  const targetMember = target instanceof GuildMember ? target : null;

  // Guild owner can always moderate
  if (moderator.id === guild.ownerId) return { ok: true };

  // Cannot moderate the guild owner
  const targetId = targetMember?.id ?? (target as User).id;
  if (targetId === guild.ownerId) {
    return { ok: false, reason: 'You cannot moderate the server owner.' };
  }

  // Cannot moderate yourself
  if (targetId === moderator.id) {
    return { ok: false, reason: 'You cannot moderate yourself.' };
  }

  // Cannot moderate the bot
  if (guild.members.me && targetId === guild.members.me.id) {
    return { ok: false, reason: 'You cannot moderate the bot.' };
  }

  // Hierarchy check (only applies if target is still in the guild)
  if (targetMember) {
    const modTop    = moderator.roles.highest.position;
    const targetTop = targetMember.roles.highest.position;
    if (targetTop >= modTop) {
      return { ok: false, reason: 'You cannot moderate a member with an equal or higher role.' };
    }
  }

  return { ok: true };
}

export function canUseModCommands(moderator: GuildMember, modRoles: string[]): boolean {
  if (moderator.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (moderator.id === moderator.guild.ownerId) return true;
  if (modRoles.length === 0) return false;
  return modRoles.some(rId => moderator.roles.cache.has(rId));
}

// ── Core Actions ───────────────────────────────────────────────────────────

export interface WarnResult {
  case: ModCase;
  warnCount: number;
  autoPunishTriggered: boolean;
  autoPunishCase?: ModCase;
}

export async function execWarn(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  reason: string,
): Promise<WarnResult> {
  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['warn'] || 'No reason provided';

  const { c, warnCount } = await createCase(guild, mod, target, 'warn', effectiveReason);
  const embed = buildCaseEmbed(c, warnCount);

  await dmUser(target, c, guild.name, cfg.dmOnPunish);
  await sendModLog(guild, 'warn', embed);
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'warn_issued', detail: `Case ${c.id}` });

  // Check auto-punish thresholds
  if (cfg.autoPunish.enabled) {
    const thresholds = [...cfg.autoPunish.thresholds].sort((a, b) => b.warns - a.warns);
    const threshold = thresholds.find(t => warnCount >= t.warns);
    if (threshold) {
      const apCase = await applyAutoPunish(guild, target, warnCount, threshold.action, threshold.duration);
      return { case: c, warnCount, autoPunishTriggered: true, autoPunishCase: apCase };
    }
  }

  return { case: c, warnCount, autoPunishTriggered: false };
}

async function applyAutoPunish(
  guild: Guild,
  target: GuildMember,
  warnCount: number,
  action: 'timeout' | 'kick' | 'ban',
  duration?: number,
): Promise<ModCase | undefined> {
  const cfg = await getGuildModConfig(guild.id);
  const reason = `Auto-punishment: ${warnCount} warnings`;
  const botMember = guild.members.me;
  if (!botMember) return undefined;

  try {
    if (action === 'timeout') {
      const dur = duration ?? 3_600_000;
      await target.timeout(dur, reason);
      const expiresAt = Date.now() + dur;
      const id = await allocateCaseId(guild.id);
      const apCase: ModCase = {
        id,
        guildId: guild.id,
        targetId: target.id,
        targetTag: target.user.tag,
        moderatorId: botMember.id,
        moderatorTag: botMember.user.tag,
        action: 'temptimeout',
        reason,
        timestamp: Date.now(),
        expiresAt,
        active: true,
      };
      await storeCase(apCase);
      await sendModLog(guild, 'mute',
        buildAutoPunishEmbed(target.user.tag, target.id, warnCount, action, id, dur));
      if (cfg.dmOnPunish) await dmUser(target, apCase, guild.name, true);
      return apCase;

    } else if (action === 'kick') {
      await target.kick(reason);
      const id = await allocateCaseId(guild.id);
      const apCase: ModCase = {
        id, guildId: guild.id, targetId: target.id, targetTag: target.user.tag,
        moderatorId: botMember.id, moderatorTag: botMember.user.tag,
        action: 'kick', reason, timestamp: Date.now(), active: false,
      };
      await storeCase(apCase);
      await sendModLog(guild, 'kick',
        buildAutoPunishEmbed(target.user.tag, target.id, warnCount, action, id));
      return apCase;

    } else if (action === 'ban') {
      await guild.bans.create(target.id, { reason, deleteMessageSeconds: 0 });
      const id = await allocateCaseId(guild.id);
      const apCase: ModCase = {
        id, guildId: guild.id, targetId: target.id, targetTag: target.user.tag,
        moderatorId: botMember.id, moderatorTag: botMember.user.tag,
        action: 'ban', reason, timestamp: Date.now(), active: true,
      };
      await storeCase(apCase);
      await sendModLog(guild, 'ban',
        buildAutoPunishEmbed(target.user.tag, target.id, warnCount, action, id));
      return apCase;
    }
  } catch (err) {
    logger.error('[Mod] Auto-punish execution failed', err);
  }
  return undefined;
}

export async function execUnwarn(
  guild: Guild,
  _mod: GuildMember,
  caseId: string,
): Promise<{ case: ModCase } | null> {
  const existing = await _getCase(guild.id, caseId);
  if (!existing || existing.action !== 'warn') return null;

  await setCaseActive(guild.id, caseId, false);
  const updated: ModCase = { ...existing, active: false };
  const embed = buildCaseEmbed(updated);
  embed.setTitle('✅ Warning Removed');
  await sendModLog(guild, 'warn', embed);
  staffEventBus.emitAction({ guildId: guild.id, userId: _mod.id, userTag: _mod.user.tag, action: 'unwarn_issued', detail: `Case ${caseId}` });
  return { case: updated };
}

export async function execClearWarnings(
  guild: Guild,
  _mod: GuildMember,
  target: GuildMember | User,
): Promise<number> {
  const targetId = target instanceof GuildMember ? target.id : target.id;
  const count = await clearUserWarnings(guild.id, targetId);
  const tag   = target instanceof GuildMember ? target.user.tag : target.tag;
  logger.info(`[Mod] Cleared ${count} warnings for ${tag} in ${guild.id}`);
  staffEventBus.emitAction({ guildId: guild.id, userId: _mod.id, userTag: _mod.user.tag, action: 'unwarn_issued', detail: `Cleared ${count} warnings for ${tag}` });
  return count;
}

export async function execMute(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  durationStr: string,
  reason: string,
): Promise<ModCase | null> {
  const ms = parseDuration(durationStr);
  if (!ms || ms <= 0) return null;
  const MAX_TIMEOUT = 28 * 24 * 3600 * 1000;
  if (ms > MAX_TIMEOUT) return null;

  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['mute'] || 'No reason provided';

  await target.timeout(ms, effectiveReason);
  const expiresAt = Date.now() + ms;
  const { c } = await createCase(guild, mod, target, 'mute', effectiveReason, { expiresAt });

  await dmUser(target, c, guild.name, cfg.dmOnPunish);
  await sendModLog(guild, 'mute', buildCaseEmbed(c));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'mute_issued', detail: `Case ${c.id}` });
  return c;
}

export async function execTempTimeout(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  durationStr: string,
  reason: string,
): Promise<ModCase | null> {
  return execMute(guild, mod, target, durationStr, reason);
}

export async function execUnmute(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  reason: string,
): Promise<ModCase> {
  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['unmute'] || 'Timeout removed';

  await target.timeout(null, effectiveReason);
  const { c } = await createCase(guild, mod, target, 'unmute', effectiveReason);

  await sendModLog(guild, 'unmute', buildCaseEmbed(c));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'unmute_issued', detail: `Case ${c.id}` });
  return c;
}

export async function execKick(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  reason: string,
): Promise<ModCase> {
  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['kick'] || 'No reason provided';

  // DM before kick (won't be able to after)
  const { c } = await createCase(guild, mod, target, 'kick', effectiveReason);
  await dmUser(target, c, guild.name, cfg.dmOnPunish);
  await target.kick(effectiveReason);
  await setCaseActive(guild.id, c.id, false);

  await sendModLog(guild, 'kick', buildCaseEmbed({ ...c, active: false }));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'kick_issued', detail: `Case ${c.id}` });
  return { ...c, active: false };
}

export async function execBan(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember | User,
  reason: string,
  deleteDays = 0,
): Promise<ModCase> {
  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['ban'] || 'No reason provided';
  const targetUser = target instanceof GuildMember ? target.user : target;

  const { c } = await createCase(guild, mod, targetUser, 'ban', effectiveReason);
  // DM first if still in guild
  if (target instanceof GuildMember) {
    await dmUser(target, c, guild.name, cfg.dmOnPunish);
  }
  await guild.bans.create(targetUser.id, {
    reason: effectiveReason,
    deleteMessageSeconds: deleteDays * 86_400,
  });
  await sendModLog(guild, 'ban', buildCaseEmbed(c));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'ban_issued', detail: `Case ${c.id}` });
  return c;
}

export async function execTempBan(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember | User,
  durationStr: string,
  reason: string,
): Promise<ModCase | null> {
  const ms = parseDuration(durationStr);
  if (!ms || ms <= 0) return null;

  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['tempban'] || 'No reason provided';
  const targetUser = target instanceof GuildMember ? target.user : target;
  const expiresAt = Date.now() + ms;

  const { c } = await createCase(guild, mod, targetUser, 'tempban', effectiveReason, { expiresAt });
  if (target instanceof GuildMember) {
    await dmUser(target, c, guild.name, cfg.dmOnPunish);
  }
  await guild.bans.create(targetUser.id, {
    reason: `${effectiveReason} [expires ${new Date(expiresAt).toUTCString()}]`,
    deleteMessageSeconds: 0,
  });
  expiryManager.schedule(c);

  await sendModLog(guild, 'tempban', buildCaseEmbed(c));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'tempban_issued', detail: `Case ${c.id}` });
  return c;
}

export async function execUnban(
  guild: Guild,
  mod: GuildMember,
  userId: string,
  reason: string,
): Promise<ModCase> {
  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['unban'] || 'No reason provided';

  // Fetch user info for the case record
  let tag = userId;
  try {
    const u = await guild.client.users.fetch(userId);
    tag = u.tag;
  } catch { /* user not cached */ }

  await guild.bans.remove(userId, effectiveReason);

  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: userId,
    targetTag: tag,
    moderatorId: mod.id,
    moderatorTag: mod.user.tag,
    action: 'unban',
    reason: effectiveReason,
    timestamp: Date.now(),
    active: false,
  };
  await storeCase(c);
  await sendModLog(guild, 'unban', buildCaseEmbed(c));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'unban_issued', detail: `Case ${c.id}` });
  return c;
}

export async function execSoftBan(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  reason: string,
): Promise<ModCase> {
  const cfg = await getGuildModConfig(guild.id);
  const effectiveReason = reason || cfg.defaultReasons['softban'] || 'No reason provided';

  const { c } = await createCase(guild, mod, target, 'softban', effectiveReason);
  await dmUser(target, c, guild.name, cfg.dmOnPunish);

  // Ban to delete messages (7 days), then immediately unban
  await guild.bans.create(target.id, { reason: effectiveReason, deleteMessageSeconds: 7 * 86_400 });
  await guild.bans.remove(target.id, 'Softban — immediately unbanned');

  await setCaseActive(guild.id, c.id, false);
  await sendModLog(guild, 'softban', buildCaseEmbed({ ...c, active: false }));
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'softban_issued', detail: `Case ${c.id}` });
  return { ...c, active: false };
}

export async function execPurge(
  guild: Guild,
  mod: GuildMember,
  channel: TextChannel,
  amount: number,
  targetUserId?: string,
): Promise<number> {
  const fetched = await channel.messages.fetch({ limit: Math.min(amount, 100) });
  const messages = targetUserId
    ? fetched.filter(m => m.author.id === targetUserId)
    : fetched;
  const deleted = await channel.bulkDelete(messages, true);
  const count = deleted.size;

  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: targetUserId ?? 'N/A',
    targetTag: targetUserId ? `<@${targetUserId}>` : 'Channel',
    moderatorId: mod.id,
    moderatorTag: mod.user.tag,
    action: 'purge',
    reason: `Purged ${count} messages in <#${channel.id}>`,
    timestamp: Date.now(),
    active: false,
    extra: { amount: count, channelId: channel.id, targetUserId },
  };
  await storeCase(c);
  staffEventBus.emitAction({ guildId: guild.id, userId: mod.id, userTag: mod.user.tag, action: 'purge_issued', detail: `Case ${c.id}` });
  return count;
}

export async function execSlowmode(
  guild: Guild,
  _mod: GuildMember,
  channel: TextChannel,
  seconds: number,
  reason: string,
): Promise<ModCase> {
  await channel.setRateLimitPerUser(seconds, reason || 'Slowmode set by moderator');

  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: channel.id,
    targetTag: `#${channel.name}`,
    moderatorId: _mod.id,
    moderatorTag: _mod.user.tag,
    action: 'slowmode',
    reason: reason || 'No reason provided',
    timestamp: Date.now(),
    active: true,
    extra: { seconds, channelId: channel.id },
  };
  await storeCase(c);
  return c;
}

export async function execNick(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  nickname: string | null,
  reason: string,
): Promise<ModCase> {
  const oldNick = target.nickname ?? target.user.username;
  await target.setNickname(nickname, reason || 'Nickname changed by moderator');

  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: target.id,
    targetTag: target.user.tag,
    moderatorId: mod.id,
    moderatorTag: mod.user.tag,
    action: 'nickname',
    reason: reason || 'No reason provided',
    timestamp: Date.now(),
    active: false,
    extra: { oldNick, newNick: nickname ?? null },
  };
  await storeCase(c);
  return c;
}

export async function execLock(
  guild: Guild,
  mod: GuildMember,
  channel: TextChannel,
  reason: string,
): Promise<ModCase> {
  const everyone = guild.roles.everyone;
  await channel.permissionOverwrites.edit(everyone, {
    SendMessages: false,
    SendMessagesInThreads: false,
  }, { reason: reason || 'Channel locked' });

  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: channel.id,
    targetTag: `#${channel.name}`,
    moderatorId: mod.id,
    moderatorTag: mod.user.tag,
    action: 'lock',
    reason: reason || 'No reason provided',
    timestamp: Date.now(),
    active: true,
    extra: { channelId: channel.id },
  };
  await storeCase(c);
  return c;
}

export async function execUnlock(
  guild: Guild,
  mod: GuildMember,
  channel: TextChannel,
  reason: string,
): Promise<ModCase> {
  const everyone = guild.roles.everyone;
  await channel.permissionOverwrites.edit(everyone, {
    SendMessages: null,
    SendMessagesInThreads: null,
  }, { reason: reason || 'Channel unlocked' });

  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: channel.id,
    targetTag: `#${channel.name}`,
    moderatorId: mod.id,
    moderatorTag: mod.user.tag,
    action: 'unlock',
    reason: reason || 'No reason provided',
    timestamp: Date.now(),
    active: false,
    extra: { channelId: channel.id },
  };
  await storeCase(c);
  return c;
}

export async function execRoleChange(
  guild: Guild,
  mod: GuildMember,
  target: GuildMember,
  role: import('discord.js').Role,
  action: 'add' | 'remove',
  reason: string,
): Promise<ModCase> {
  if (action === 'add') {
    await target.roles.add(role, reason || 'Role added by moderator');
  } else {
    await target.roles.remove(role, reason || 'Role removed by moderator');
  }

  const modAction: ModerationAction = action === 'add' ? 'role_add' : 'role_remove';
  const id = await allocateCaseId(guild.id);
  const c: ModCase = {
    id,
    guildId: guild.id,
    targetId: target.id,
    targetTag: target.user.tag,
    moderatorId: mod.id,
    moderatorTag: mod.user.tag,
    action: modAction,
    reason: reason || 'No reason provided',
    timestamp: Date.now(),
    active: false,
    extra: { roleId: role.id, roleName: role.name },
  };
  await storeCase(c);
  return c;
}

// ── Case lookup helpers ────────────────────────────────────────────────────

export async function getHistory(
  guild: Guild,
  userId: string,
  page = 0,
): Promise<{ cases: ModCase[]; page: number; totalPages: number; embed: EmbedBuilder }> {
  const cases = await getUserCases(guild.id, userId);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  let tag = userId;
  try { const u = await guild.client.users.fetch(userId); tag = u.tag; } catch { /* */ }

  return {
    cases,
    page: safePage,
    totalPages,
    embed: buildHistoryEmbed(cases, tag, userId, safePage, totalPages),
  };
}

export { getUserCases, getActiveWarnCount };
