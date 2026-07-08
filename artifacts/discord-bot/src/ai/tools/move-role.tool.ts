import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MoveRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'move_role',
    description: 'Moves a role above or below another role, or to a specific position.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Role to move' },
        above: { type: 'string', description: 'Move this role directly above the specified role name' },
        below: { type: 'string', description: 'Move this role directly below the specified role name' },
        position: { type: 'number', description: 'Absolute position number (0 = bottom)' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name);
    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    if (params['above']) {
      const ref = guild.roles.cache.find(r => r.name.toLowerCase() === String(params['above']).toLowerCase());
      if (!ref) return { success: false, message: `Reference role "${params['above']}" not found` };
      await role.setPosition(ref.position + 1);
      return { success: true, message: `Moved **@${role.name}** above **@${ref.name}**` };
    }

    if (params['below']) {
      const ref = guild.roles.cache.find(r => r.name.toLowerCase() === String(params['below']).toLowerCase());
      if (!ref) return { success: false, message: `Reference role "${params['below']}" not found` };
      await role.setPosition(Math.max(1, ref.position - 1));
      return { success: true, message: `Moved **@${role.name}** below **@${ref.name}**` };
    }

    if (typeof params['position'] === 'number') {
      await role.setPosition(params['position']);
      return { success: true, message: `Moved **@${role.name}** to position ${params['position']}` };
    }

    return { success: false, message: 'Specify above, below, or position' };
  }
}
