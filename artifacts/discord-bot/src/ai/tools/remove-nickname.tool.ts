import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RemoveNicknameTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'remove_nickname',
    description: 'Removes (clears) the nickname of a specific member, reverting to their username.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
      },
      required: ['user'],
    },
    dangerous: false,
    examples: ['Remove nickname for JohnDoe', 'Clear nickname for user 123456789'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const members = await guild.members.fetch();
    const member = members.find(m =>
      m.id === query ||
      m.user.username.toLowerCase() === query ||
      m.displayName.toLowerCase() === query,
    );
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };
    if (!member.nickname) return { success: true, message: `**${member.displayName}** has no nickname to remove` };

    const old = member.nickname;
    await member.setNickname(null);
    return { success: true, message: `Removed nickname **${old}** from **${member.user.username}**` };
  }
}
