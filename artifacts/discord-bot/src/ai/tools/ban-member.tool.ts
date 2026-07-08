import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BanMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'ban_member',
    description: 'Bans a member from the server.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to ban' },
        reason: { type: 'string', description: 'Reason for the ban (optional)' },
        delete_messages_days: { type: 'number', description: 'Number of days of messages to delete (0–7, optional)' },
      },
      required: ['username'],
    },
    dangerous: true,
    dangerDescription: 'Permanently bans the member from the server.',
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim();
    const reason = params['reason'] ? String(params['reason']) : 'No reason provided';
    const deleteDays = typeof params['delete_messages_days'] === 'number'
      ? Math.min(7, Math.max(0, params['delete_messages_days']))
      : 0;

    const members = await guild.members.search({ query: username, limit: 1 });
    const member = members.first();
    if (!member) return { success: false, message: `Member "${username}" not found` };
    if (!member.bannable) return { success: false, message: `Cannot ban **${member.user.tag}** — insufficient permissions` };

    await member.ban({ reason, deleteMessageSeconds: deleteDays * 86_400 });
    return { success: true, message: `Banned **${member.user.tag}** — Reason: ${reason}` };
  }
}
