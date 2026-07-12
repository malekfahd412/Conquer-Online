// ─────────────────────────────────────────────────────────────────────────────
// Security Engine — Rate limiting, trust checks, punishment, logging, restore.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  GuildMember,
  User,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
  AuditLogEvent,
  type Guild,
  type Channel,
  type Role,
} from 'discord.js';
import type {
  SecurityModuleKey,
  SecurityModuleConfig,
  SecurityPunishment,
  SecurityEvent,
} from './security-types';
import { MODULE_META } from './security-types';
import { logSecurityEvent } from './security-store';
import {
  execWarn,
  execMute,
  execKick,
  execBan,
} from '../moderation/mod.service';
import { logger } from '../../utils/logger';

// ── In-memory rate limiter (sliding window) ──────────────────────────────────

class RateLimiter {
  private readonly windows = new Map<string, number[]>();

  /** Returns true when the limit has been reached (i.e. a violation). */
  check(key: string, limit: number, windowMs: number): boolean {
    const now  = Date.now();
    const prev = (this.windows.get(key) ?? []).filter(t => t > now - windowMs);
    prev.push(now);
    this.windows.set(key, prev);
    return prev.length >= limit;
  }

  count(key: string, windowMs: number): number {
    const now = Date.now();
    return (this.windows.get(key) ?? []).filter(t => t > now - windowMs).length;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}

export const rateLimiter = new RateLimiter();

// ── Trust check ───────────────────────────────────────────────────────────────

export function isTrusted(
  member: GuildMember | null | undefined,
  cfg: SecurityModuleConfig,
): boolean {
  if (!member) return false;
  if (cfg.whitelist.includes(member.id))   return true;
  if (cfg.trustedUsers.includes(member.id)) return true;
  if (cfg.trustedRoles.some(rid => member.roles.cache.has(rid))) return true;
  // Server owner is always trusted
  if (member.guild.ownerId === member.id) return true;
  return false;
}

// ── Punishment ────────────────────────────────────────────────────────────────

export async function applyPunishment(
  guild: Guild,
  targetId: string,
  punishment: SecurityPunishment,
  reason: string,
): Promise<void> {
  const botMember = guild.members.me;
  if (!botMember) return;

  const targetMember = await guild.members.fetch(targetId).catch(() => null);

  try {
    switch (punishment) {
      case 'warn':
        if (targetMember) await execWarn(guild, botMember, targetMember, reason);
        break;
      case 'timeout':
        if (targetMember) await execMute(guild, botMember, targetMember, '1h', reason);
        break;
      case 'kick':
        if (targetMember) await execKick(guild, botMember, targetMember, reason);
        break;
      case 'ban': {
        const user = targetMember?.user ?? await guild.client.users.fetch(targetId).catch(() => null);
        if (user) await execBan(guild, botMember, user, reason);
        else await guild.bans.create(targetId, { reason }).catch(() => {});
        break;
      }
    }
  } catch (err) {
    logger.error(`[Security] Punishment ${punishment} failed for ${targetId}`, err);
  }
}

// ── Security log embed ────────────────────────────────────────────────────────

export async function emitSecurityLog(
  guild: Guild,
  module: SecurityModuleKey,
  cfg: SecurityModuleConfig,
  globalLogChannelId: string | undefined,
  event: {
    executor: GuildMember | User | null;
    target?: string;
    action: string;
    detail?: string;
    punishment?: SecurityPunishment;
    restored?: boolean;
  },
  mentionRoleId?: string,
): Promise<void> {
  const meta      = MODULE_META[module];
  const channelId = cfg.logChannelId ?? globalLogChannelId;

  // Persist the event
  const secEvent: SecurityEvent = {
    guildId:          guild.id,
    module,
    executorId:       event.executor?.id ?? 'unknown',
    targetId:         event.target,
    action:           event.action,
    detail:           event.detail,
    timestamp:        Date.now(),
    punishmentApplied: event.punishment,
    restored:         event.restored,
  };
  await logSecurityEvent(secEvent).catch(() => {});

  if (!channelId) return;
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased()) return;

  const executor = event.executor;
  const execStr  = executor
    ? `<@${executor.id}> (\`${executor instanceof GuildMember ? executor.user.tag : executor.tag}\`)`
    : '`Unknown`';

  const punishColor =
    event.punishment === 'ban'  ? 0xed4245 :
    event.punishment === 'kick' ? 0xf5a623 :
    meta.color;

  const embed = new EmbedBuilder()
    .setColor(punishColor)
    .setTitle(`${meta.emoji} ${meta.label} — Detection`)
    .addFields(
      { name: '⚡ Action',   value: event.action, inline: true  },
      { name: '👤 Executor', value: execStr,       inline: true  },
      { name: '🕐 Time',     value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `Security Center Pro · ${meta.label}` })
    .setTimestamp();

  if (event.target)    embed.addFields({ name: '🎯 Target',    value: event.target.slice(0, 1024),  inline: true  });
  if (event.detail)    embed.addFields({ name: '📋 Detail',    value: event.detail.slice(0, 1024),  inline: false });
  if (event.punishment) embed.addFields({ name: '⚖️ Punishment', value: `\`${event.punishment.toUpperCase()}\``, inline: true });
  if (event.restored !== undefined)
    embed.addFields({ name: '♻️ Restored', value: event.restored ? '✅ Yes' : '❌ No', inline: true });

  try {
    const content = mentionRoleId ? `<@&${mentionRoleId}>` : undefined;
    await (ch as TextChannel).send({ content, embeds: [embed] });
  } catch (err) {
    logger.error('[Security] Log emit failed', err);
  }
}

// ── Audit log executor lookup ─────────────────────────────────────────────────

export async function fetchAuditExecutor(
  guild: Guild,
  action: AuditLogEvent,
  targetId?: string,
  maxAgeMs = 4000,
): Promise<GuildMember | User | null> {
  // Brief wait so the audit log entry has time to propagate
  await new Promise(r => setTimeout(r, 1200));
  try {
    const logs = await guild.fetchAuditLogs({ type: action, limit: 10 });
    const now  = Date.now();
    const entry = logs.entries.find(e => {
      if (now - e.createdTimestamp > maxAgeMs) return false;
      if (targetId && e.target && 'id' in (e.target as object) && (e.target as { id: string }).id !== targetId) return false;
      return true;
    });
    if (!entry?.executor) return null;
    return guild.members.fetch(entry.executor.id).catch(() => entry.executor as User);
  } catch {
    return null;
  }
}

// ── Core violation handler ────────────────────────────────────────────────────

export interface ViolationOpts {
  guild: Guild;
  module: SecurityModuleKey;
  cfg: SecurityModuleConfig;
  globalLogChannelId?: string;
  /** Role ID to @mention as message content when the security alert is posted. */
  globalMentionRoleId?: string;
  executor: GuildMember | User | null;
  target?: string;
  action: string;
  detail?: string;
  /** Set to a unique key for rate-limit tracking, or omit to always punish. */
  rateLimitKey?: string;
  restored?: boolean;
  /** Skip the rate-limit check and always punish (used when caller already detected a nuke). */
  skipRateLimit?: boolean;
}

export async function handleViolation(opts: ViolationOpts): Promise<void> {
  const { guild, module, cfg, globalLogChannelId, executor, action, detail, restored } = opts;

  if (!cfg.enabled) return;
  if (!executor) return;

  // Bot check
  const isBot = executor instanceof GuildMember ? executor.user.bot : (executor as User).bot;
  if (cfg.ignoreBots && isBot) return;

  // Trust check
  const execMember = executor instanceof GuildMember
    ? executor
    : await guild.members.fetch(executor.id).catch(() => null);
  if (isTrusted(execMember, cfg)) return;

  // Rate-limit check
  let shouldPunish: boolean;
  if (opts.skipRateLimit) {
    shouldPunish = true;
  } else if (opts.rateLimitKey) {
    const rlKey = `${guild.id}:${module}:${opts.rateLimitKey}`;
    shouldPunish = rateLimiter.check(rlKey, cfg.actionLimit, cfg.timeWindowMs);
    if (shouldPunish) rateLimiter.reset(rlKey);
  } else {
    shouldPunish = true;
  }

  let punishmentApplied: SecurityPunishment | undefined;
  if (shouldPunish) {
    punishmentApplied = cfg.punishment;
    await applyPunishment(guild, executor.id, cfg.punishment, `[Security] ${action}`);
  }

  await emitSecurityLog(guild, module, cfg, globalLogChannelId, {
    executor,
    target: opts.target,
    action,
    detail,
    punishment: punishmentApplied,
    restored,
  }, opts.globalMentionRoleId);
}

// ── Best-effort channel restore ───────────────────────────────────────────────

export async function restoreChannel(guild: Guild, channel: Channel): Promise<boolean> {
  if (!('name' in channel)) return false;
  try {
    const ch = channel as { name: string; type: ChannelType; parentId?: string | null };
    const allowed: ChannelType[] = [
      ChannelType.GuildText,
      ChannelType.GuildVoice,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildForum,
      ChannelType.GuildStageVoice,
    ];
    if (!allowed.includes(ch.type)) return false;
    await guild.channels.create({
      name:   ch.name,
      type:   ch.type as ChannelType.GuildText,
      parent: ch.parentId ?? undefined,
      reason: '[Security] Auto-restored by Anti-Nuke',
    });
    return true;
  } catch {
    return false;
  }
}

export async function restoreRole(guild: Guild, role: Role): Promise<boolean> {
  try {
    await guild.roles.create({
      name:        role.name,
      color:       role.color,
      permissions: role.permissions,
      reason:      '[Security] Auto-restored by Anti-Nuke',
    });
    return true;
  } catch {
    return false;
  }
}

// ── Emergency mode ────────────────────────────────────────────────────────────

export async function enableEmergencyMode(
  guild: Guild,
  logChannelId?: string,
  mentionRoleId?: string,
): Promise<string[]> {
  const lockedChannels: string[] = [];
  const everyoneId = guild.roles.everyone.id;

  for (const [, channel] of guild.channels.cache) {
    if (!channel.isTextBased()) continue;
    const tc = channel as TextChannel;
    try {
      const ov = tc.permissionOverwrites.cache.get(everyoneId);
      if (!ov?.deny.has(PermissionFlagsBits.SendMessages)) {
        await tc.permissionOverwrites.edit(everyoneId, { SendMessages: false });
        lockedChannels.push(channel.id);
      }
    } catch { /* bot lacks perms */ }
  }

  // Delete all active invites
  try {
    const invites = await guild.invites.fetch();
    for (const [, inv] of invites) await inv.delete('Emergency Mode activated').catch(() => {});
  } catch { /* fine */ }

  if (logChannelId) {
    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (ch?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🚨 Emergency Mode Activated')
        .setDescription(
          `**${lockedChannels.length}** channels locked.\n` +
          'All invites deleted.\n' +
          'Only whitelisted users can manage the server.\n\n' +
          'Use **Security Center → Emergency Mode → Restore Server** to re-enable.',
        )
        .setTimestamp();
      const emergencyContent = mentionRoleId ? `<@&${mentionRoleId}>` : undefined;
      await (ch as TextChannel).send({ content: emergencyContent, embeds: [embed] }).catch(() => {});
    }
  }

  return lockedChannels;
}

export async function disableEmergencyMode(
  guild: Guild,
  lockedChannels: string[],
  logChannelId?: string,
  mentionRoleId?: string,
): Promise<void> {
  const everyoneId = guild.roles.everyone.id;
  let restored = 0;

  for (const channelId of lockedChannels) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) continue;
    try {
      await (channel as TextChannel).permissionOverwrites.edit(everyoneId, { SendMessages: null });
      restored++;
    } catch { /* fine */ }
  }

  if (logChannelId) {
    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (ch?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Emergency Mode Deactivated — Server Restored')
        .setDescription(`**${restored}** channels unlocked. Server is back to normal.`)
        .setTimestamp();
      const restoreContent = mentionRoleId ? `<@&${mentionRoleId}>` : undefined;
      await (ch as TextChannel).send({ content: restoreContent, embeds: [embed] }).catch(() => {});
    }
  }
}
