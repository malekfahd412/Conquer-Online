import type { Guild, Role } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetRoleHoistTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_role_hoist',
    description: 'Sets whether a role is displayed separately in the member list (hoisted) or not.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the role' },
        hoist: { type: 'string', enum: ['true', 'false'], description: 'Show separately (true) or not (false)' },
      },
      required: ['name', 'hoist'],
    },
    dangerous: false,
    examples: ['Hoist the VIP role so it shows separately', 'Stop hoisting the Member role'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name) as Role | undefined;
    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    const hoist = params['hoist'] === 'true';
    await role.setHoist(hoist);

    return {
      success: true,
      message: `**@${role.name}** is now ${hoist ? '📌 displayed separately in the member list' : 'merged into the online members list'}`,
    };
  }
}
