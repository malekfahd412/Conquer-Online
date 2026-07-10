import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnusedRolesReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unused_roles_report',
    description: 'Lists roles that are assigned to zero members (excluding @everyone and managed/bot roles). Useful for cleanup.',
    parameters: {
      type: 'object',
      properties: {
        include_managed: { type: 'string', description: 'Set to "true" to include bot/managed roles in the report' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const includedManaged = String(params['include_managed'] ?? '').toLowerCase() === 'true';
    const unused = guild.roles.cache.filter(r => {
      if (r.id === guild.id) return false; // skip @everyone
      if (!includedManaged && r.managed) return false;
      const memberCount = guild.members.cache.filter(m => m.roles.cache.has(r.id)).size;
      return memberCount === 0;
    });

    if (unused.size === 0) return { success: true, message: `✅ All roles in **${guild.name}** have at least one member assigned` };

    const lines = [
      `🎭 **Unused Roles Report** — **${guild.name}**`,
      `Found **${unused.size}** role(s) with 0 members (out of ${guild.roles.cache.size} total):\n`,
    ];
    for (const [, role] of unused.sort((a, b) => b.position - a.position)) {
      const color = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : 'No color';
      const flags = [role.hoist ? 'hoisted' : '', role.mentionable ? 'mentionable' : '', role.managed ? 'managed' : ''].filter(Boolean).join(', ');
      lines.push(`• **${role.name}** — pos: ${role.position} | ${color}${flags ? ` | ${flags}` : ''}`);
    }
    lines.push(`\n💡 Use \`delete_role\` to remove unneeded roles, or \`cleanup_unused_roles\` to bulk-remove them.`);

    return { success: true, message: lines.join('\n') };
  }
}
