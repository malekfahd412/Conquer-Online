import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { groupByJoinMonth } from './analytics-helpers';

export class GrowthAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'growth_analytics',
    description: 'Server growth analytics based on member join dates: monthly join trends, growth rate, and member milestones.',
    parameters: {
      type: 'object',
      properties: {
        months: { type: 'string', description: 'Number of months to show (default: 12)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const monthsToShow = Math.min(24, Math.max(1, parseInt(String(params['months'] ?? '12')) || 12));
    const humans = guild.members.cache.filter(m => !m.user.bot);
    const byMonth = groupByJoinMonth([...humans.values()]);
    const entries = Object.entries(byMonth).slice(-monthsToShow);

    if (entries.length === 0) return { success: true, message: 'No join date data available (members not cached)' };

    const maxJoins = Math.max(...entries.map(([, c]) => c), 1);
    const totalInPeriod = entries.reduce((s, [, c]) => s + c, 0);
    const avgPerMonth = Math.round(totalInPeriod / entries.length);

    const lines = [
      `📈 **Growth Analytics** — **${guild.name}**`,
      `Total members: **${guild.memberCount}** | Period: last ${entries.length} month(s) | Avg joins/month: **${avgPerMonth}**`,
      '',
      `**Monthly Join Activity:**`,
    ];

    for (const [month, count] of entries) {
      const bar = '█'.repeat(Math.round((count / maxJoins) * 15));
      lines.push(`  ${month.padEnd(10)} ${bar} **${count}**`);
    }

    // Trend
    const recent3 = entries.slice(-3).reduce((s, [, c]) => s + c, 0) / 3;
    const older3 = entries.slice(-6, -3).reduce((s, [, c]) => s + c, 0) / 3;
    const trend = older3 > 0 ? Math.round(((recent3 - older3) / older3) * 100) : 0;
    lines.push('', `**Trend (recent 3 vs prior 3 months):** ${trend > 0 ? `📈 +${trend}%` : trend < 0 ? `📉 ${trend}%` : '➡️ Stable'}`);

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
