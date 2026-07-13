// ─────────────────────────────────────────────────────────────────────────────
// ReportScheduler — periodically checks every guild's report config and posts
// the daily/weekly/monthly staff report when its period has rolled over.
//
// Unlike `expiry-manager.ts` (which schedules precise setTimeouts and must be
// restart-safe down to the millisecond), a report only needs to fire once per
// calendar day/week/month, so a simple periodic "did the period key change?"
// check is sufficient and needs no persisted timer state.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client, TextChannel } from 'discord.js';
import { getAllReportConfigs, recordReportRun } from './staff-reports-store';
import { buildReport } from './report-builder';
import { logger } from '../../utils/logger';

const CHECK_INTERVAL_MS = 15 * 60_000; // 15 minutes

function dailyKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function weeklyKey(d: Date): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function monthlyKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

class ReportScheduler {
  private client: Client | null = null;
  private timer: NodeJS.Timeout | null = null;

  setClient(client: Client): void {
    this.client = client;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkAll().catch(err => logger.error('[Staff] Report scheduler tick failed', err));
    }, CHECK_INTERVAL_MS);
    // Run one check shortly after startup too, in case a period rolled over while the bot was offline.
    setTimeout(() => {
      this.checkAll().catch(err => logger.error('[Staff] Initial report scheduler check failed', err));
    }, 30_000);
    logger.info('[Staff] Report scheduler started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async checkAll(): Promise<void> {
    if (!this.client) return;
    const configs = await getAllReportConfigs();
    const now = new Date();

    for (const cfg of configs) {
      if (!cfg.channelId) continue;
      try {
        if (cfg.dailyEnabled && cfg.lastDailyKey !== dailyKey(now)) {
          await this.runReport(cfg.guildId, cfg.channelId, 'daily', dailyKey(now));
        }
        if (cfg.weeklyEnabled && cfg.lastWeeklyKey !== weeklyKey(now)) {
          await this.runReport(cfg.guildId, cfg.channelId, 'weekly', weeklyKey(now));
        }
        if (cfg.monthlyEnabled && cfg.lastMonthlyKey !== monthlyKey(now)) {
          await this.runReport(cfg.guildId, cfg.channelId, 'monthly', monthlyKey(now));
        }
      } catch (err) {
        logger.error(`[Staff] Report check failed for guild ${cfg.guildId}`, err);
      }
    }
  }

  private async runReport(guildId: string, channelId: string, type: 'daily' | 'weekly' | 'monthly', periodKey: string): Promise<void> {
    if (!this.client) return;
    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const { embed, summary } = await buildReport(guild, type);
    await (channel as TextChannel).send({ embeds: [embed] }).catch(err =>
      logger.error(`[Staff] Failed to post ${type} report in guild ${guildId}`, err),
    );
    await recordReportRun(guildId, type, summary, periodKey);
  }
}

export const reportScheduler = new ReportScheduler();
