import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_role',
    description: 'Deletes an existing role from the server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the role to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the role and removes it from all members.',
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name || r.id === String(params['name']));

    if (!role) return { success: false, message: `Role "${params['name']}" not found` };
    if (role.managed) return { success: false, message: `Role "${role.name}" is managed by an integration and cannot be deleted` };

    await role.delete();
    return { success: true, message: `Deleted role **@${role.name}**` };
  }
}
