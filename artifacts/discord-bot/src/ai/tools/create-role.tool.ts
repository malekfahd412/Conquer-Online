import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

function parseColor(color: string): number {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0x000000 : parsed;
}

export class CreateRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_role',
    description: 'Creates a new role in the server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Role name' },
        color: { type: 'string', description: 'Role color as hex (e.g. #FF5733) — optional' },
        hoist: { type: 'string', enum: ['true', 'false'], description: 'Show separately in member list — optional' },
        mentionable: { type: 'string', enum: ['true', 'false'], description: 'Allow anyone to @mention this role — optional' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Role name is required' };

    const role = await guild.roles.create({
      name,
      color: params['color'] ? parseColor(String(params['color'])) : undefined,
      hoist: params['hoist'] === 'true',
      mentionable: params['mentionable'] === 'true',
    });

    return { success: true, message: `Created role **@${role.name}**` };
  }
}
