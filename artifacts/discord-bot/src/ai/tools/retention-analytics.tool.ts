import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RetentionAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'retention_analytics',
    description: 'Member retention analysis based on join cohorts from member cache: how many members from each cohort (time window) are still present.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Cohort period: week, month, quarter (default: month)',
          enum: ['week', 'month', 'quarter'],
        },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const period = String(params['period'] ?? 'month').toLowerCase();
    const periodMs = { week: 7 * 24 * 3600 * 1000, month: 30 * 24 * 3600 * 1000, quarter: 90 * 24 * 3600 * 1000 }[period] ?? 30 * 24 * 3600 * 1000;

    const humans = [...guild.members.cache.filter(m => !m.user.bot).values()].filter(m => m.joinedAt);
    const now = Date.now();

    // Group into cohorts
    const cohorts: Record<string, { joined: number; present: number }> = {};
    for (const m of humans) {
      const joinedMs = m.joinedTimestamp ?? 0;
      const ageMs = now - joinedMs;
      const cohortIndex = Math.floor(ageMs / periodMs);
      const cohortLabel = `${cohortIndex * (period === 'week' ? 7 : period === 'quarter' ? 90 : 30)}–${(cohortIndex + 1) * (period === 'week' ? 7 : period === 'quarter' ? 90 : 30)} days ago`;
      if (!cohorts[cohortLabel]) cohorts[cohortLabel] = { joined: 0, present: 0 };
      cohorts[cohortLabel].joined++;
      cohorts[cohortLabel].present++; // they're present (still in guild)
    }

    const lines = [
      `📉 **Retention Analytics** — **${guild.name}** (cohort: ${period})`,
      `Total human members: **${humans.length}**`,
      `\n_Note: This shows current members grouped by when they joined._`,
      `_Members who already left are not visible in this data (Discord limitation)._`,
      '',
      `**Cohort Breakdown (members still present from each join window):**`,
    ];

    const sorted = Object.entries(cohorts).sort(([a], [b]) => {
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      return aNum - bNum;
    }).slice(0, 12);

    for (const [cohort, data] of sorted) {
      lines.push(`  **${cohort}**: ${data.present} member(s) still active`);
    }

    lines.push('', `⚠️ **Discord API limitation:** Member leave events are not retroactively tracked. True retention rates require external tracking.`);

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
