import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

function parseColor(color: string): number {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0x000000 : parsed;
}

export class ChangeRoleColorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'change_role_color',
    description: "Changes a role's display color.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Role name' },
        color: { type: 'string', description: 'New color as hex (e.g. #FF5733 or FF5733)' },
      },
      required: ['name', 'color'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const color = String(params['color'] ?? '').trim();

    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name);
    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    const colorNum = parseColor(color);
    await role.setColor(colorNum);

    return { success: true, message: `Changed **@${role.name}** color to \`#${colorNum.toString(16).padStart(6, '0').toUpperCase()}\`` };
  }
}
