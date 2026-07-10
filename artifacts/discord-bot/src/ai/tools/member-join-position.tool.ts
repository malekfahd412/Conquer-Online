import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MemberJoinPositionTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'member_join_position',
    description: 'Returns the join order position of a member (e.g. "JohnDoe was the 42nd person to join").',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
      },
      required: ['user'],
    },
    dangerous: false,
    examples: ['What join position is JohnDoe?', 'When did JohnDoe join relative to other members?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const members = await guild.members.fetch();
    const member = members.find(m =>
      m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query,
    );
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    const sorted = Array.from(members.values())
      .filter(m => !!m.joinedTimestamp)
      .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0));

    const position = sorted.findIndex(m => m.id === member.id) + 1;
    const total = sorted.length;

    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
    };

    const joinedAt = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'unknown';

    return {
      success: true,
      message: `**${member.displayName}** was the **${ordinal(position)}** member to join the server (out of ${total} current members).\n• Joined: ${joinedAt}`,
    };
  }
}
