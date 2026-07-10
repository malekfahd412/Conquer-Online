import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnbanMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unban_member',
    description: 'Removes a ban from a user, allowing them to rejoin the server.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username (with or without discriminator) or user ID of the banned user' },
        reason: { type: 'string', description: 'Reason for unbanning (optional)' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Unban PlayerOne', 'Remove ban from DragonSlayer99'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim().toLowerCase();
    const bans = await guild.bans.fetch();

    const ban = bans.find(
      b =>
        b.user.username.toLowerCase() === username ||
        b.user.tag.toLowerCase() === username ||
        b.user.id === username,
    );

    if (!ban) return { success: false, message: `No ban found for "${params['username']}"` };

    await guild.members.unban(ban.user.id, params['reason'] ? String(params['reason']) : undefined);
    return { success: true, message: `✅ Unbanned **${ban.user.tag}** — they can now rejoin the server` };
  }
}
