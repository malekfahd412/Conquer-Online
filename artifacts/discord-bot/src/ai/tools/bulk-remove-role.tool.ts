import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkRemoveRoleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_remove_role',
    description: 'Removes a role from multiple members at once (up to 20). Provide a comma-separated list of usernames.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Name of the role to remove' },
        users: { type: 'string', description: 'Comma-separated list of usernames or display names' },
      },
      required: ['role', 'users'],
    },
    dangerous: false,
    examples: ['Remove VIP from PlayerOne, DragonSlayer', 'Take the Moderator role from Alice, Bob'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const roleName = String(params['role'] ?? '').trim().toLowerCase();
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
    if (!role) return { success: false, message: `Role "${params['role']}" not found` };

    const userList = String(params['users'] ?? '')
      .split(',')
      .map(u => u.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);

    if (userList.length === 0) return { success: false, message: 'At least one username is required' };

    const members = await guild.members.fetch();
    const removed: string[] = [];
    const notFound: string[] = [];

    for (const username of userList) {
      const member = members.find(
        m => m.user.username.toLowerCase() === username ||
          m.displayName.toLowerCase() === username ||
          m.user.tag.toLowerCase() === username,
      );
      if (!member) {
        notFound.push(username);
        continue;
      }
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
      }
      removed.push(member.user.tag);
    }

    const lines = [];
    if (removed.length > 0) lines.push(`✅ Removed **@${role.name}** from: ${removed.join(', ')}`);
    if (notFound.length > 0) lines.push(`⚠️ Not found: ${notFound.join(', ')}`);

    return { success: removed.length > 0, message: lines.join('\n') };
  }
}
