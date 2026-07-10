import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { groupByJoinMonth } from './analytics-helpers';

export class WeeklyReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'weekly_report',
    description: 'Weekly server summary: member changes this week, moderation actions in the past 7 days, boost count, and voice usage.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const membersJoinedThisWeek = guild.members.cache.filter(m => !m.user.bot && (m.joinedTimestamp ?? 0) >= weekAgo).size;

    const modEvents = [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove, AuditLogEvent.MessageDelete];
    const actionCounts: Record<string, number> = {};
    let totalActions = 0;
    for (const event of modEvents) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit: 50 });
        for (const entry of logs.entries.values()) {
          if (entry.createdTimestamp >= weekAgo) {
            const key = event.toString().replace(/_/g, ' ').toLowerCase();
            actionCounts[key] = (actionCounts[key] ?? 0) + 1;
            totalActions++;
          }
        }
      } catch { /* skip */ }
    }

    const humans = guild.members.cache.filter(m => !m.user.bot);
    const byMonth = groupByJoinMonth([...humans.values()]);
    const latestMonth = Object.entries(byMonth).pop();

    const weekStart = new Date(weekAgo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const lines = [
      `📋 **Weekly Report** — **${guild.name}**`,
      `📅 ${weekStart} – ${weekEnd}`,
      '',
      `**👥 Membership:**`,
      `Current: ${guild.memberCount} | New this week: **${membersJoinedThisWeek}**`,
      `Latest month cohort: ${latestMonth ? `${latestMonth[0]} — ${latestMonth[1]} joined` : 'N/A'}`,
      '',
      `**🛡️ Moderation (${totalActions} actions this week):**`,
    ];
    if (totalActions === 0) lines.push('  ✅ No moderation actions this week');
    else for (const [action, count] of Object.entries(actionCounts)) lines.push(`  • ${action}: **${count}**`);

    lines.push('', `**💎 Boost Status:** Tier ${guild.premiumTier} | ${guild.premiumSubscriptionCount ?? 0} boost(s)`);
    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
