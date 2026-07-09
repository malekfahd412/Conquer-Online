import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RemoveTimeoutTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'remove_timeout',
    description: 'Removes a timeout from a member, restoring their ability to interact in the server.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member' },
        reason: { type: 'string', description: 'Reason for removing the timeout (optional)' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Remove timeout from PlayerOne', 'Un-mute DragonSlayer99'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim().toLowerCase();
    if (!username) return { success: false, message: 'Username is required' };

    const members = await guild.members.fetch();
    const member = members.find(
      m => m.user.username.toLowerCase() === username ||
        m.displayName.toLowerCase() === username ||
        m.user.tag.toLowerCase() === username,
    );

    if (!member) return { success: false, message: `Member "${params['username']}" not found` };
    if (!member.isCommunicationDisabled()) return { success: false, message: `${member.user.tag} is not currently timed out` };

    await member.timeout(null, params['reason'] ? String(params['reason']) : 'Timeout removed by AI Control Center');
    return { success: true, message: `Removed timeout from **${member.user.tag}**` };
  }
}
