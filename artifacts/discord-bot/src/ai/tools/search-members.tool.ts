import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SearchMembersTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'search_members',
    description: 'Search members by username, display name, or nickname. Returns matching members with role info.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or partial name to search for' },
        limit: { type: 'string', description: 'Max results to return (default 10, max 50)' },
      },
      required: ['query'],
    },
    dangerous: false,
    examples: ['Search members named John', 'Find members with "mod" in their name'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['query'] ?? '').toLowerCase().trim();
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '10'), 10) || 10));
    if (!query) return { success: false, message: 'Search query is required' };

    const members = await guild.members.fetch();
    const matches = members
      .filter(m =>
        m.user.username.toLowerCase().includes(query) ||
        m.displayName.toLowerCase().includes(query) ||
        (m.nickname?.toLowerCase() ?? '').includes(query),
      )
      .first(limit);

    if (matches.length === 0) return { success: true, message: `No members found matching **${query}**` };

    const lines = matches.map(m => {
      const roles = m.roles.cache
        .filter(r => r.name !== '@everyone')
        .map(r => r.name)
        .slice(0, 3)
        .join(', ');
      return `• **${m.displayName}** (${m.user.username}) — ${roles || 'no roles'} — ID: ${m.id}`;
    });

    return { success: true, message: `**🔍 Search results for "${query}" (${matches.length}):**\n${lines.join('\n')}` };
  }
}
