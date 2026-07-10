import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class LeaderboardAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'leaderboard_analytics',
    description: 'Generates leaderboards: longest-serving members, most roles, boosters ranked by duration, moderators by action count (from audit log).',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Leaderboard type: tenure (longest members), roles (most roles), boosters, all (default: all)',
          enum: ['tenure', 'roles', 'boosters', 'all'],
        },
        top: { type: 'string', description: 'Number of entries to show (default: 10)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const type = String(params['type'] ?? 'all').toLowerCase();
    const topN = Math.min(25, Math.max(1, parseInt(String(params['top'] ?? '10')) || 10));
    const lines = [`🏆 **Leaderboard Analytics** — **${guild.name}**\n`];
    const humans = guild.members.cache.filter(m => !m.user.bot);

    if (type === 'all' || type === 'tenure') {
      const byTenure = [...humans.values()]
        .filter(m => m.joinedAt)
        .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0))
        .slice(0, topN);
      lines.push('**📅 Longest-Serving Members:**');
      for (const [i, m] of byTenure.entries()) {
        const since = m.joinedAt ? `<t:${Math.floor(m.joinedTimestamp! / 1000)}:D>` : 'Unknown';
        lines.push(`  ${i + 1}. **${m.displayName}** — joined ${since}`);
      }
      lines.push('');
    }

    if (type === 'all' || type === 'roles') {
      const byRoles = [...humans.values()]
        .sort((a, b) => b.roles.cache.size - a.roles.cache.size)
        .slice(0, topN);
      lines.push('**🎭 Most Roles:**');
      for (const [i, m] of byRoles.entries()) {
        lines.push(`  ${i + 1}. **${m.displayName}** — ${m.roles.cache.size - 1} role(s)`);
      }
      lines.push('');
    }

    if (type === 'all' || type === 'boosters') {
      const boosters = [...guild.members.cache.filter(m => m.premiumSince).values()]
        .sort((a, b) => (a.premiumSince?.getTime() ?? 0) - (b.premiumSince?.getTime() ?? 0))
        .slice(0, topN);
      lines.push(`**💎 Top Boosters (${boosters.length}):**`);
      if (boosters.length === 0) lines.push('  _No boosters_');
      for (const [i, m] of boosters.entries()) {
        const since = m.premiumSince ? `<t:${Math.floor(m.premiumSince.getTime() / 1000)}:R>` : '';
        lines.push(`  ${i + 1}. **${m.displayName}** — boosting ${since}`);
      }
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
