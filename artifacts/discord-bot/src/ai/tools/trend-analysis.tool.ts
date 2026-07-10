import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { groupByJoinMonth } from './analytics-helpers';

export class TrendAnalysisTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'trend_analysis',
    description: 'Analyses server trends over time based on available data: member growth trajectory, boost history, and join rate changes.',
    parameters: {
      type: 'object',
      properties: {
        months: { type: 'string', description: 'Number of months to analyze (default: 12)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const months = Math.min(24, Math.max(2, parseInt(String(params['months'] ?? '12')) || 12));
    const humans = guild.members.cache.filter(m => !m.user.bot);
    const byMonth = groupByJoinMonth([...humans.values()]);
    const entries = Object.entries(byMonth).slice(-months);

    if (entries.length < 2) {
      return { success: true, message: 'Insufficient data for trend analysis (need at least 2 months of join data)' };
    }

    const counts = entries.map(([, c]) => c);
    const total = counts.reduce((a, b) => a + b, 0);
    const avg = total / counts.length;
    const variance = counts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    // Linear regression (slope = trend direction)
    const n = counts.length;
    const sumX = counts.reduce((_, __, i) => _ + i, 0);
    const sumY = counts.reduce((a, b) => a + b, 0);
    const sumXY = counts.reduce((s, c, i) => s + i * c, 0);
    const sumX2 = counts.reduce((s, _, i) => s + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    const trend = slope > 1 ? '📈 Strong growth' : slope > 0 ? '📈 Moderate growth' : slope < -1 ? '📉 Declining' : slope < 0 ? '📉 Slight decline' : '➡️ Stable';

    // Peak and trough
    const peakIdx = counts.indexOf(Math.max(...counts));
    const troughIdx = counts.indexOf(Math.min(...counts));

    const lines = [
      `📊 **Trend Analysis** — **${guild.name}** (${entries.length} months)`,
      '',
      `**Overall Trend: ${trend}**`,
      `Average joins/month: **${avg.toFixed(1)}** | Std deviation: ${stdDev.toFixed(1)}`,
      `Growth slope: ${slope.toFixed(2)} members/month`,
      '',
      `**Peak:** ${entries[peakIdx]?.[0]} — ${entries[peakIdx]?.[1]} joins`,
      `**Trough:** ${entries[troughIdx]?.[0]} — ${entries[troughIdx]?.[1]} joins`,
      '',
      `**Monthly Breakdown:**`,
      ...entries.map(([month, count]) => {
        const delta = count - avg;
        const indicator = delta > stdDev ? '▲' : delta < -stdDev ? '▼' : '─';
        return `  ${indicator} ${month}: **${count}**`;
      }),
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
