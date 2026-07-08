import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_role',
    description: 'Renames an existing role.',
    parameters: {
      type: 'object',
      properties: {
        current_name: { type: 'string', description: 'Current role name' },
        new_name: { type: 'string', description: 'New role name' },
      },
      required: ['current_name', 'new_name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const currentName = String(params['current_name'] ?? '').trim().toLowerCase();
    const newName = String(params['new_name'] ?? '').trim();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === currentName);

    if (!role) return { success: false, message: `Role "${params['current_name']}" not found` };
    if (!newName) return { success: false, message: 'New name is required' };

    await role.setName(newName);
    return { success: true, message: `Renamed role to **@${newName}**` };
  }
}
