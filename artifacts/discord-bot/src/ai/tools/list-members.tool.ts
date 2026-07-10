import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListMembersTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_members',
    description: 'Lists members in the server, optionally filtered by role. Returns up to 50.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Filter by role name (optional)' },
        bots_only: { type: 'string', enum: ['true', 'false'], description: 'Only show bots (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['List all Moderators', 'Show me all VIP members', 'List all bots'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const members = await guild.members.fetch();
    const roleFilter = params['role'] ? String(params['role']).trim().toLowerCase() : null;
    const botsOnly = params['bots_only'] === 'true';

    let filtered = members.filter(m => {
      if (botsOnly && !m.user.bot) return false;
      if (!botsOnly && m.user.bot) return false;
      if (roleFilter) {
        return m.roles.cache.some(r => r.name.toLowerCase() === roleFilter);
      }
      return true;
    });

    if (filtered.size === 0) {
      return { success: false, message: `No members found${roleFilter ? ` with role "${params['role']}"` : ''}` };
    }

    const shown = Array.from(filtered.values()).slice(0, 50);
    const lines = shown.map(m => {
      const roles = m.roles.cache
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map(r => r.name)
        .slice(0, 3)
        .join(', ');
      return `• **${m.user.tag}**${m.displayName !== m.user.username ? ` (${m.displayName})` : ''}${roles ? ` — ${roles}` : ''}`;
    });

    const total = filtered.size;
    const header = `**${total} member(s)${roleFilter ? ` with role "${params['role']}"` : ''}${total > 50 ? ' (showing first 50)' : ''}:**`;
    return { success: true, message: `${header}\n${lines.join('\n')}` };
  }
}
