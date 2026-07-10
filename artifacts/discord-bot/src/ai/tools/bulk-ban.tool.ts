import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkBanTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_ban',
    description: 'Bans multiple members at once using discord.js bulkBan. Accepts comma-separated usernames or IDs.',
    parameters: {
      type: 'object',
      properties: {
        users: { type: 'string', description: 'Comma-separated usernames or user IDs to ban' },
        delete_message_days: { type: 'string', description: 'Days of messages to delete (0–7, default 1)' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: ['users', 'reason'],
    },
    dangerous: true,
    dangerDescription: 'Permanently bans multiple members from the server.',
    examples: ['Bulk ban users Spammer1, Spammer2 for spam raid', 'Ban IDs 111222333, 444555666 and delete 1 day of messages'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const reason = String(params['reason'] ?? 'Bulk ban');
    const deleteMessageSeconds = Math.min(7, Math.max(0, parseInt(String(params['delete_message_days'] ?? '1'), 10) || 1)) * 86400;
    const usersRaw = String(params['users'] ?? '');
    if (!usersRaw) return { success: false, message: 'Users list is required' };

    const queries = usersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const members = await guild.members.fetch();

    const ids: string[] = [];
    for (const q of queries) {
      const m = members.find(m => m.id === q || m.user.username.toLowerCase() === q || m.displayName.toLowerCase() === q);
      if (m) ids.push(m.id);
      else if (/^\d{17,20}$/.test(q)) ids.push(q);
    }

    if (ids.length === 0) return { success: false, message: 'No valid users found' };
    if (ids.length > 200) return { success: false, message: 'Max 200 users per bulk ban' };

    const result = await guild.members.bulkBan(ids, { deleteMessageSeconds, reason });
    return {
      success: true,
      message: `**Bulk Ban:** ${result.bannedUsers.length} banned, ${result.failedUsers.length} failed — Reason: ${reason}`,
    };
  }
}
