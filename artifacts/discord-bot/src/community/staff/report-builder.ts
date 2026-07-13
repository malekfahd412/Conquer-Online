// ─────────────────────────────────────────────────────────────────────────────
// ReportBuilder — composes the daily/weekly/monthly staff report embeds from
// existing data (points transactions, profiles, goals). Never recomputes or
// duplicates tracking logic — it only reads what staff.service.ts already
// aggregated.
// ─────────────────────────────────────────────────────────────────────────────
import { EmbedBuilder } from 'discord.js';
import type { Guild } from 'discord.js';
import type { LeaderboardPeriod } from './types';
import { staffService } from './staff.service';
import { formatDurationMs } from './embeds';

export type ReportType = 'daily' | 'weekly' | 'monthly';

const PERIOD_FOR_REPORT: Record<ReportType, LeaderboardPeriod> = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
};

const TITLE: Record<ReportType, string> = {
  daily: '📅 Daily Staff Report',
  weekly: '🗓️ Weekly Staff Report',
  monthly: '📆 Monthly Staff Report',
};

async function tagFor(guild: Guild, userId: string): Promise<string> {
  try {
    const member = await guild.members.fetch(userId);
    return member.user.tag;
  } catch {
    return `<@${userId}>`;
  }
}

export async function buildReport(guild: Guild, type: ReportType): Promise<{ embed: EmbedBuilder; summary: string }> {
  const period = PERIOD_FOR_REPORT[type];
  const leaderboard = await staffService.getLeaderboard(guild.id, period);
  const top = leaderboard.slice(0, 5);

  const topLines = await Promise.all(
    top.map(async (e, idx) => `**${idx + 1}.** ${await tagFor(guild, e.userId)} — ${e.points} pts (${e.actionCount} actions)`),
  );

  const mostActive = [...leaderboard].sort((a, b) => b.actionCount - a.actionCount).slice(0, 3);
  const mostActiveLines = await Promise.all(
    mostActive.map(async e => `${await tagFor(guild, e.userId)} — ${e.actionCount} actions`),
  );

  const leastActive = [...leaderboard].filter(e => e.actionCount > 0).sort((a, b) => a.actionCount - b.actionCount).slice(0, 3);
  const leastActiveLines = await Promise.all(
    leastActive.map(async e => `${await tagFor(guild, e.userId)} — ${e.actionCount} actions`),
  );

  const inactive = await staffService.getInactiveStaff(guild.id);
  const inactiveLines = await Promise.all(
    inactive.slice(0, 10).map(async i => `${await tagFor(guild, i.userId)} — inactive ${i.daysSinceActive}d`),
  );

  const goals = await staffService.listGoals(guild.id);
  const relevantGoals = goals.filter(g => g.period === period || g.period === 'alltime');
  const goalLines = await Promise.all(
    relevantGoals.slice(0, 10).map(async g => {
      const progress = await staffService.computeGoalProgress(g);
      const pct = g.target > 0 ? Math.min(100, Math.round((progress / g.target) * 100)) : 0;
      const status = g.completedAt ? '✅' : `${pct}%`;
      return `**${g.label}** — ${Math.round(progress)}/${g.target} (${status})`;
    }),
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(TITLE[type])
    .setDescription(`Staff performance summary for **${guild.name}**`)
    .addFields(
      { name: '🏆 Top Staff', value: topLines.length ? topLines.join('\n') : '_No activity recorded_', inline: false },
      { name: '⚡ Most Active', value: mostActiveLines.length ? mostActiveLines.join('\n') : '_No data_', inline: true },
      { name: '🐢 Least Active', value: leastActiveLines.length ? leastActiveLines.join('\n') : '_No data_', inline: true },
      { name: '😴 Inactive Staff', value: inactiveLines.length ? inactiveLines.join('\n') : '_None — everyone is active_', inline: false },
      { name: '🎯 Goal Progress', value: goalLines.length ? goalLines.join('\n') : '_No goals configured_', inline: false },
    )
    .setTimestamp();

  const summary = `Top: ${top.map(e => `${e.userId}(${e.points})`).join(', ') || 'none'} | Inactive: ${inactive.length} | Goals: ${relevantGoals.length}`;
  return { embed, summary };
}

export function formatActivity(ms: number): string {
  return formatDurationMs(ms);
}
