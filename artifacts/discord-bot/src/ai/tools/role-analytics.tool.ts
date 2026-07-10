import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { progressBar } from './analytics-helpers';

export class RoleAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'role_analytics',
    description: 'Analyzes role usage across the server: member counts per role, permission distribution, hoisted roles, bot-managed roles, and coverage statistics.',
    parameters: {
      type: 'object',
      properties: {
        top: { type: 'string', description: 'Number of top roles to show (default: 15)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const topN = Math.min(25, Math.max(1, parseInt(String(params['top'] ?? '15')) || 15));
    const members = guild.members.cache;
    const roles = guild.roles.cache.filter(r => r.id !== guild.id);

    const roleStats = [...roles.values()].map(r => {
      const count = members.filter(m => m.roles.cache.has(r.id)).size;
      return {
        name: r.name, count, position: r.position,
        isAdmin: r.permissions.has('Administrator'),
        isManaged: r.managed, isHoisted: r.hoist,
      };
    }).sort((a, b) => b.count - a.count);

    const maxCount = Math.max(1, roleStats[0]?.count ?? 1);
    const adminRoles = roleStats.filter(r => r.isAdmin).length;
    const managedRoles = roleStats.filter(r => r.isManaged).length;
    const hoistedRoles = roleStats.filter(r => r.isHoisted).length;
    const emptyRoles = roleStats.filter(r => r.count === 0).length;

    const lines = [
      `🎭 **Role Analytics** — **${guild.name}**`,
      `Total roles: **${roles.size}/250** | Admin: ${adminRoles} | Managed: ${managedRoles} | Hoisted: ${hoistedRoles} | Empty: ${emptyRoles}`,
      '',
      `**Top ${Math.min(topN, roleStats.length)} Roles by Member Count:**`,
    ];

    for (const r of roleStats.slice(0, topN)) {
      const bar = progressBar(r.count, maxCount, 8);
      const flags = [r.isAdmin ? '🔴ADMIN' : '', r.isManaged ? '🤖BOT' : '', r.isHoisted ? '📌' : ''].filter(Boolean).join(' ');
      lines.push(`  ${bar} **${r.name}** — ${r.count} member(s) ${flags}`);
    }

    const membersWithNoRoles = members.filter(m => !m.user.bot && m.roles.cache.size <= 1).size;
    lines.push('', `**Members with only @everyone:** ${membersWithNoRoles} (${Math.round(membersWithNoRoles / Math.max(1, members.size) * 100)}%)`);

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
