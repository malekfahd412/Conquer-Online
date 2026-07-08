import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AssignRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'assign_role',
    description: 'Assigns a role to a server member.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member' },
        role: { type: 'string', description: 'Name of the role to assign' },
      },
      required: ['username', 'role'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim();
    const roleName = String(params['role'] ?? '').trim().toLowerCase();

    const members = await guild.members.search({ query: username, limit: 1 });
    const member = members.first();
    if (!member) return { success: false, message: `Member "${username}" not found` };

    const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
    if (!role) return { success: false, message: `Role "${params['role']}" not found` };

    await member.roles.add(role);
    return { success: true, message: `Assigned **@${role.name}** to **${member.user.tag}**` };
  }
}
