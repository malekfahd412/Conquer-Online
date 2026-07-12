import type { Client } from 'discord.js';
import { getActiveTempCases, expireOverdueCases, setCaseActive } from './mod-store';
import { resolveLogConfig } from '../../discord/logging/log-store';
import { buildCaseEmbed } from './embeds';
import type { ModCase } from './types';
import { logger } from '../../utils/logger';

// ── Expiry Manager ─────────────────────────────────────────────────────────

/**
 * Tracks active temp-ban and temp-timeout cases and automatically resolves
 * them when they expire. Uses setTimeout for precise expiry (no polling).
 * Survives bot restarts by loading all active temp cases from disk on startup.
 */
class ExpiryManager {
  private client: Client | null = null;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  setClient(client: Client): void {
    this.client = client;
  }

  /** Call once on startup (after client is available). */
  async start(): Promise<void> {
    // Mark already-expired cases as inactive
    const fixed = await expireOverdueCases();
    if (fixed > 0) logger.info(`[Expiry] Cleaned up ${fixed} overdue case(s) from previous run`);

    // Schedule timers for all remaining active temp cases
    const cases = await getActiveTempCases();
    let scheduled = 0;
    for (const c of cases) {
      this.schedule(c);
      scheduled++;
    }
    if (scheduled > 0) logger.info(`[Expiry] Scheduled ${scheduled} active temp case(s)`);
  }

  /** Register a new temp case for automatic expiry. */
  schedule(c: ModCase): void {
    if (!c.expiresAt) return;
    this.cancel(c.id);

    const delay = c.expiresAt - Date.now();
    if (delay <= 0) {
      // Expire immediately (should have been caught by expireOverdueCases, but belt-and-suspenders)
      this.expire(c).catch(err => logger.error(`[Expiry] Immediate expiry error for ${c.id}`, err));
      return;
    }

    // JS max setTimeout is ~24.8 days (2^31-1 ms). For longer durations, re-schedule
    const JSMAX = 2_147_483_647;
    const timeout = setTimeout(async () => {
      if (Date.now() < (c.expiresAt ?? 0)) {
        // Still in the future — re-schedule (handles >24 day durations)
        this.schedule(c);
      } else {
        await this.expire(c).catch(err => logger.error(`[Expiry] Expiry error for ${c.id}`, err));
      }
    }, Math.min(delay, JSMAX));

    this.timers.set(c.id, timeout);
  }

  /** Cancel a pending expiry timer (e.g. if a mod manually unbans early). */
  cancel(caseId: string): void {
    const t = this.timers.get(caseId);
    if (t) { clearTimeout(t); this.timers.delete(caseId); }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async expire(c: ModCase): Promise<void> {
    this.timers.delete(c.id);
    await setCaseActive(c.guildId, c.id, false);
    logger.info(`[Expiry] Case ${c.id} (${c.action}) expired for user ${c.targetId}`);

    if (!this.client) return;

    const guild = await this.client.guilds.fetch(c.guildId).catch(() => null);
    if (!guild) return;

    if (c.action === 'tempban') {
      // Unban the user
      try {
        await guild.bans.remove(c.targetId, `Temp ban expired (Case ${c.id})`);
        logger.info(`[Expiry] Unbanned ${c.targetId} — temp ban expired`);
      } catch (err) {
        // May already have been unbanned manually — not fatal
        logger.info(`[Expiry] Could not unban ${c.targetId} (may already be unbanned): ${(err as Error).message}`);
        return;
      }
    }
    // temptimeout: Discord automatically removes timeout when it expires.
    // We just mark the case inactive which we already did above.

    // Send a log to the configured unban/unmute channel
    try {
      const logType = c.action === 'tempban' ? 'mod_unban' as const : 'mod_unmute' as const;
      const lcfg = await resolveLogConfig(c.guildId, logType);
      if (lcfg) {
        const embed = buildCaseEmbed({ ...c, active: false });
        embed.setTitle('⏰ Temp Punishment Expired');
        embed.setDescription(
          c.action === 'tempban'
            ? `<@${c.targetId}>'s temp ban has expired. They may rejoin the server.`
            : `<@${c.targetId}>'s timeout has expired.`,
        );

        const ch = await guild.channels.fetch(lcfg.channelId).catch(() => null);
        if (ch?.isTextBased()) {
          const mentions = lcfg.mentionRoles?.map(id => `<@&${id}>`).join(' ') || undefined;
          await (ch as import('discord.js').TextChannel).send({ content: mentions, embeds: [embed] });
        }
      }
    } catch (err) {
      logger.error(`[Expiry] Log emit failed for expired case ${c.id}`, err);
    }
  }
}

export const expiryManager = new ExpiryManager();
