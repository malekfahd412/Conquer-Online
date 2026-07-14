import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import {
  upsertTempRole,
  removeTempRole,
  removeTempRolesForMember,
  removeTempRolesForRole,
  removeTempRolesForGuild,
  getAllTempRoles,
  makeEntryId,
  type TempRoleEntry,
} from './temp-role-store';
import { resolveLogConfig } from '../../discord/logging/log-store';
import { logger } from '../../utils/logger';
import { formatDuration, discordFull } from './types';

// ── Constants ─────────────────────────────────────────────────────────────

/** JS max setTimeout delay (~24.8 days). Re-schedule for longer durations. */
const JSMAX = 2_147_483_647;

// ── TempRoleManager ───────────────────────────────────────────────────────

/**
 * Manages temporary role assignments. Persists entries to disk so timers
 * survive bot restarts. Handles all edge cases:
 *  - Role removed manually before expiry  → timer cancelled
 *  - Member leaves                        → timer cancelled, entry removed
 *  - Role deleted                         → timer cancelled, entry removed
 *  - Guild disappears                     → timer cancelled, entry removed
 *  - Duplicate add (same user/role pair)  → old timer replaced
 */
class TempRoleManager {
  private client: Client | null = null;
  /** Map<entryId, timeoutHandle> */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  setClient(client: Client): void {
    this.client = client;
  }

  // ── Startup ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const now = Date.now();
    const all = await getAllTempRoles();

    const overdue = all.filter(e => e.expiresAt <= now);
    const pending = all.filter(e => e.expiresAt  >  now);

    if (overdue.length > 0) {
      logger.info(`[TempRoles] Expiring ${overdue.length} overdue temporary role(s) from previous session`);
      await Promise.all(
        overdue.map(e =>
          this.expire(e).catch(err =>
            logger.error(`[TempRoles] Overdue expiry failed for ${e.id}`, err),
          ),
        ),
      );
    }

    for (const entry of pending) {
      this.scheduleTimer(entry);
    }

    if (pending.length > 0) {
      logger.info(`[TempRoles] Restored ${pending.length} pending temporary role timer(s)`);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Persist a new temp-role entry and schedule its removal timer.
   * If a timer already exists for the same user/role pair it is replaced.
   */
  async add(entry: TempRoleEntry): Promise<void> {
    await upsertTempRole(entry);
    this.scheduleTimer(entry);
    logger.info(
      `[TempRoles] Scheduled: user=${entry.userId} role=${entry.roleId} ` +
      `guild=${entry.guildId} expires=${new Date(entry.expiresAt).toISOString()}`,
    );
  }

  /**
   * Called from guildMemberUpdate when roles are removed.
   * Uses the in-memory timer map for a fast O(1) check — only touches disk
   * when a temp role is actually affected.
   */
  async onRoleRemoved(guildId: string, userId: string, removedRoleIds: string[]): Promise<void> {
    const affected = removedRoleIds
      .map(roleId => makeEntryId(guildId, userId, roleId))
      .filter(id => this.timers.has(id));

    if (affected.length === 0) return; // fast path — most updates won't be temp roles

    for (const id of affected) {
      this.cancelTimer(id);
      await removeTempRole(id);
      logger.info(`[TempRoles] Timer cancelled — role manually removed (id=${id})`);
    }
  }

  /** Member left — cancel all their pending temp-role timers. */
  async onMemberLeave(guildId: string, userId: string): Promise<void> {
    const ids = await removeTempRolesForMember(guildId, userId);
    for (const id of ids) this.cancelTimer(id);
    if (ids.length > 0) {
      logger.info(`[TempRoles] Member ${userId} left guild ${guildId} — ${ids.length} timer(s) cancelled`);
    }
  }

  /** Role deleted — cancel all pending timers that reference it. */
  async onRoleDelete(guildId: string, roleId: string): Promise<void> {
    const ids = await removeTempRolesForRole(guildId, roleId);
    for (const id of ids) this.cancelTimer(id);
    if (ids.length > 0) {
      logger.info(`[TempRoles] Role ${roleId} deleted in guild ${guildId} — ${ids.length} timer(s) cancelled`);
    }
  }

  /** Guild unavailable — cancel all pending timers for that guild. */
  async onGuildDelete(guildId: string): Promise<void> {
    const ids = await removeTempRolesForGuild(guildId);
    for (const id of ids) this.cancelTimer(id);
    if (ids.length > 0) {
      logger.info(`[TempRoles] Guild ${guildId} removed — ${ids.length} timer(s) cancelled`);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private cancelTimer(id: string): void {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
  }

  private scheduleTimer(entry: TempRoleEntry): void {
    this.cancelTimer(entry.id); // prevent duplicates

    const delay = entry.expiresAt - Date.now();
    if (delay <= 0) {
      this.expire(entry).catch(err =>
        logger.error(`[TempRoles] Immediate expiry error for ${entry.id}`, err),
      );
      return;
    }

    const handle = setTimeout(async () => {
      if (Date.now() < entry.expiresAt) {
        // Still in the future (>24.8 day duration) — re-schedule
        this.scheduleTimer(entry);
      } else {
        await this.expire(entry).catch(err =>
          logger.error(`[TempRoles] Expiry error for ${entry.id}`, err),
        );
      }
    }, Math.min(delay, JSMAX));

    this.timers.set(entry.id, handle);
  }

  private async expire(entry: TempRoleEntry): Promise<void> {
    this.timers.delete(entry.id);
    await removeTempRole(entry.id);

    logger.info(`[TempRoles] Expired: user=${entry.userId} role=${entry.roleId} guild=${entry.guildId}`);

    if (!this.client) return;

    const guild = await this.client.guilds.fetch(entry.guildId).catch(() => null);
    if (!guild) return; // guild gone — nothing to do

    // Remove the role from the member
    const member = await guild.members.fetch(entry.userId).catch(() => null);
    if (member) {
      try {
        await member.roles.remove(entry.roleId, `Temporary role expired (duration: ${formatDuration(entry.durationMs)})`);
        logger.info(`[TempRoles] Role ${entry.roleId} removed from ${entry.userId} (expired)`);
      } catch (err) {
        // Role may already be gone or member left between fetch and remove — not fatal
        logger.info(`[TempRoles] Could not remove role ${entry.roleId} from ${entry.userId}: ${(err as Error).message}`);
      }
    }
    // Member not in guild → role assignment already gone, nothing to remove.

    // Emit expiry log to the role_removed log channel
    await this.emitExpiryLog(guild, entry);
  }

  // ── New public API (extend / reduce / removeNow) ─────────────────────────

  /**
   * Add time to an existing temporary role.
   * Replaces the in-memory timer automatically.
   * Returns the updated entry, or null if no entry was found.
   */
  async extend(guildId: string, userId: string, roleId: string, addMs: number): Promise<TempRoleEntry | null> {
    const id = makeEntryId(guildId, userId, roleId);
    const all = await getAllTempRoles();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return null;

    const updated: TempRoleEntry = { ...all[idx], expiresAt: all[idx].expiresAt + addMs };
    await upsertTempRole(updated);
    this.scheduleTimer(updated); // cancelTimer is called inside scheduleTimer — no duplicate risk
    logger.info(
      `[TempRoles] Extended: user=${userId} role=${roleId} guild=${guildId} ` +
      `+${addMs}ms → expires=${new Date(updated.expiresAt).toISOString()}`,
    );
    return updated;
  }

  /**
   * Subtract time from an existing temporary role.
   * If the new expiresAt is in the past, the role is expired immediately.
   * Returns { expired, entry } where entry is the updated (or pre-expiry) version.
   */
  async reduce(
    guildId: string, userId: string, roleId: string, subtractMs: number,
  ): Promise<{ expired: boolean; entry: TempRoleEntry | null }> {
    const id = makeEntryId(guildId, userId, roleId);
    const all = await getAllTempRoles();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return { expired: false, entry: null };

    const updated: TempRoleEntry = { ...all[idx], expiresAt: all[idx].expiresAt - subtractMs };

    if (updated.expiresAt <= Date.now()) {
      // Expire immediately — expire() handles store removal and Discord role removal
      await this.expire(updated);
      return { expired: true, entry: updated };
    }

    await upsertTempRole(updated);
    this.scheduleTimer(updated);
    logger.info(
      `[TempRoles] Reduced: user=${userId} role=${roleId} guild=${guildId} ` +
      `-${subtractMs}ms → expires=${new Date(updated.expiresAt).toISOString()}`,
    );
    return { expired: false, entry: updated };
  }

  /**
   * Cancel and remove a temporary role entry immediately (manual removal by mod).
   * Does NOT remove the Discord role — the caller is responsible for that.
   * Returns the entry that was removed, or null if not found.
   */
  async removeNow(guildId: string, userId: string, roleId: string): Promise<TempRoleEntry | null> {
    const id = makeEntryId(guildId, userId, roleId);
    const all = await getAllTempRoles();
    const entry = all.find(e => e.id === id);
    if (!entry) return null;

    this.cancelTimer(id);
    await removeTempRole(id);
    logger.info(`[TempRoles] Manually removed: user=${userId} role=${roleId} guild=${guildId}`);
    return entry;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async emitExpiryLog(
    guild: import('discord.js').Guild,
    entry: TempRoleEntry,
  ): Promise<void> {
    try {
      const lcfg = await resolveLogConfig(entry.guildId, 'temp_role_expired');
      if (!lcfg) return;

      let roleName = entry.roleId;
      try {
        const role = await guild.roles.fetch(entry.roleId);
        if (role) roleName = role.name;
      } catch { /* role may be deleted */ }

      const embed = new EmbedBuilder()
        .setColor(lcfg.color ?? 0xf5a623)
        .setTitle('⌛ Temporary Role Expired')
        .setDescription(`<@${entry.userId}> had a temporary role that has now expired and been automatically removed.`)
        .addFields(
          { name: '👤 User',              value: `<@${entry.userId}>`,                          inline: true  },
          { name: '🎭 Role',              value: `<@&${entry.roleId}> \`${roleName}\``,          inline: true  },
          { name: '⏱️ Original Duration', value: `\`${formatDuration(entry.durationMs)}\``,      inline: true  },
          { name: '📅 Expired At',        value: discordFull(entry.expiresAt),                   inline: true  },
          { name: '📋 Reason',            value: 'Temporary role expired automatically.',         inline: false },
        )
        .setFooter({ text: `User ID: ${entry.userId} · Role ID: ${entry.roleId}` })
        .setTimestamp();

      const ch = await guild.channels.fetch(lcfg.channelId).catch(() => null);
      if (!ch?.isTextBased()) return;

      const mentions = lcfg.mentionRoles?.map(id => `<@&${id}>`).join(' ') || undefined;
      await (ch as TextChannel).send({ content: mentions, embeds: [embed] });
    } catch (err) {
      logger.error(`[TempRoles] Expiry log emit failed for ${entry.id}`, err);
    }
  }
}

export const tempRoleManager = new TempRoleManager();
export type { TempRoleEntry };
