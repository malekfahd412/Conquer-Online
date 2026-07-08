import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetNicknameTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_nickname',
    description: "Sets or clears a member's server nickname.",
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member' },
        nickname: { type: 'string', description: 'New nickname (empty string to clear)' },
      },
      required: ['username', 'nickname'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim();
    const nickname = String(params['nickname'] ?? '').trim() || null;

    const members = await guild.members.search({ query: username, limit: 1 });
    const member = members.first();
    if (!member) return { success: false, message: `Member "${username}" not found` };

    await member.setNickname(nickname);

    return {
      success: true,
      message: nickname
        ? `Set **${member.user.tag}**'s nickname to **${nickname}**`
        : `Cleared **${member.user.tag}**'s nickname`,
    };
  }
}
