import type { Guild, Role } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_role',
    description: 'Clones an existing role with the same permissions, color, and settings, optionally with a new name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the role to clone' },
        new_name: { type: 'string', description: 'Name for the cloned role (optional, defaults to "name-copy")' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Clone the Moderator role as "Trial Moderator"', 'Duplicate the VIP role'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name) as Role | undefined;

    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    const newName = params['new_name'] ? String(params['new_name']).trim() : `${role.name}-copy`;
    const cloned = await guild.roles.create({
      name: newName,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions,
      position: role.position,
    });

    return { success: true, message: `Cloned role **@${role.name}** → **@${cloned.name}** with same permissions` };
  }
}
