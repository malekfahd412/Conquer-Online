import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class KickMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'kick_member',
    description: 'Kicks a member from the server.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to kick' },
        reason: { type: 'string', description: 'Reason for the kick (optional)' },
      },
      required: ['username'],
    },
    dangerous: true,
    dangerDescription: 'Kicks the member from the server (they can rejoin with an invite).',
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim();
    const reason = params['reason'] ? String(params['reason']) : 'No reason provided';

    const members = await guild.members.search({ query: username, limit: 1 });
    const member = members.first();
    if (!member) return { success: false, message: `Member "${username}" not found` };
    if (!member.kickable) return { success: false, message: `Cannot kick **${member.user.tag}** — insufficient permissions` };

    await member.kick(reason);
    return { success: true, message: `Kicked **${member.user.tag}** — Reason: ${reason}` };
  }
}
