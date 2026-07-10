import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SoftBanTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'soft_ban',
    description: 'Soft-bans a member: bans them to delete their recent messages, then immediately unbans them. Effectively a kick with message cleanup.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
        delete_message_days: { type: 'string', description: 'Days of messages to delete (1–7, default 3)' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: ['user', 'reason'],
    },
    dangerous: true,
    dangerDescription: 'Removes the member and deletes their recent message history.',
    examples: ['Soft-ban Spammer for spam (delete 7 days of messages)', 'Softban ToxicUser to clean up their messages'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const reason = String(params['reason'] ?? 'Soft-ban');
    const deleteSeconds = Math.min(7, Math.max(1, parseInt(String(params['delete_message_days'] ?? '3'), 10) || 3)) * 86400;

    const members = await guild.members.fetch();
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    const me = guild.members.me;
    if (me && member.roles.highest.position >= me.roles.highest.position) {
      return { success: false, message: 'Cannot soft-ban: target has equal or higher role hierarchy' };
    }

    const userId = member.id;
    const username = member.user.username;

    await guild.members.ban(userId, { deleteMessageSeconds: deleteSeconds, reason: `[Soft-Ban] ${reason}` });
    await guild.members.unban(userId, `Soft-ban unban — ${reason}`);

    return { success: true, message: `**Soft-Ban:** ${username} was soft-banned — removed from server and last ${Math.round(deleteSeconds / 86400)} day(s) of messages deleted. They can rejoin with a new invite.` };
  }
}
