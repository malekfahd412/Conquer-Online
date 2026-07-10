import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListRolesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_roles',
    description: 'Lists all roles in the server with their member counts, colors, and key flags.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
    examples: ['List all roles', 'What roles does this server have?', 'Show me all the roles'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position);

    if (roles.size === 0) return { success: false, message: 'No roles found (besides @everyone)' };

    const lines = roles.map(r => {
      const flags: string[] = [];
      if (r.hoist) flags.push('hoisted');
      if (r.mentionable) flags.push('mentionable');
      if (r.managed) flags.push('managed');
      const color = r.hexColor !== '#000000' ? ` [${r.hexColor}]` : '';
      const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
      return `• **@${r.name}**${color} — ${r.members.size} member(s)${flagStr}`;
    });

    return {
      success: true,
      message: `**${roles.size} role(s):**\n${lines.join('\n')}`,
    };
  }
}
