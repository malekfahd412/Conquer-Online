import type { Guild, Role } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RoleInfoTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'role_info',
    description: 'Shows detailed information about a role: color, permissions, member count, position, and flags.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the role' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Show info for Moderator role', 'What permissions does VIP have?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name) as Role | undefined;
    if (!role) return { success: false, message: `Role "${params['name']}" not found` };

    const perms = role.permissions.toArray();
    const lines = [
      `**🎭 @${role.name}**`,
      `• ID: ${role.id}`,
      `• Position: ${role.position}`,
      `• Color: ${role.hexColor}`,
      `• Members: ${role.members.size}`,
      `• Hoisted: ${role.hoist ? 'Yes' : 'No'}`,
      `• Mentionable: ${role.mentionable ? 'Yes' : 'No'}`,
      `• Managed (bot): ${role.managed ? 'Yes' : 'No'}`,
      `• Created: <t:${Math.floor(role.createdTimestamp / 1000)}:D>`,
      `• Permissions (${perms.length}): ${perms.length > 0 ? perms.join(', ') : 'None'}`,
    ];

    return { success: true, message: lines.join('\n') };
  }
}
