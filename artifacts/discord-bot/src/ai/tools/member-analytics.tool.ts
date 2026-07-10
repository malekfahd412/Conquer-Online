import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { fmtNum, fmtDate, groupByJoinMonth } from './analytics-helpers';

export class MemberAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'member_analytics',
    description: 'Detailed member analytics: join distribution by month, account age stats, top roles by membership, online status breakdown.',
    parameters: {
      type: 'object',
      properties: {
        top_roles: { type: 'string', description: 'Number of top roles to show by member count (default: 10)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const topN = Math.min(20, Math.max(1, parseInt(String(params['top_roles'] ?? '10')) || 10));
    const members = guild.members.cache;
    const humans = members.filter(m => !m.user.bot);
    const bots = members.filter(m => m.user.bot);

    const joinDates = humans.map(m => m.joinedTimestamp ?? 0).filter(Boolean).sort((a, b) => a - b);
    const oldest = joinDates[0] ? fmtDate(joinDates[0]) : 'Unknown';
    const newest = joinDates[joinDates.length - 1] ? fmtDate(joinDates[joinDates.length - 1]) : 'Unknown';

    const byMonth = groupByJoinMonth([...humans.values()]);
    const recentMonths = Object.entries(byMonth).slice(-6);

    const roleUsage = guild.roles.cache
      .filter(r => r.id !== guild.id)
      .map(r => ({ name: r.name, count: guild.members.cache.filter(m => m.roles.cache.has(r.id)).size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    const lines = [
      `👥 **Member Analytics** — **${guild.name}**`,
      '',
      `**Overview:**`,
      `Total: ${fmtNum(guild.memberCount)} | Humans: ${fmtNum(humans.size)} | Bots: ${fmtNum(bots.size)}`,
      `Oldest join: ${oldest} | Newest: ${newest}`,
      '',
      `**Recent Join Activity (last 6 months):**`,
      ...recentMonths.map(([month, count]) => `  ${month}: **${count}** joined`),
      '',
      `**Top Roles by Member Count:**`,
      ...roleUsage.map((r, i) => `  ${i + 1}. **${r.name}** — ${r.count} member(s)`),
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
