import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MemberInfoTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'member_info',
    description: 'Shows detailed information about a member: roles, join date, account age, timeout status, permissions.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Show info for PlayerOne', 'What roles does DragonSlayer have?', 'When did KingZero join?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim().toLowerCase();
    const members = await guild.members.fetch();
    const member = members.find(
      m => m.user.username.toLowerCase() === username ||
        m.displayName.toLowerCase() === username ||
        m.user.tag.toLowerCase() === username,
    );

    if (!member) return { success: false, message: `Member "${params['username']}" not found` };

    const roles = member.roles.cache
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => `@${r.name}`)
      .join(', ') || 'None';

    const timeoutUntil = member.communicationDisabledUntil;
    const timedOut = timeoutUntil && timeoutUntil > new Date();

    const lines = [
      `**👤 ${member.user.tag}**`,
      `• Display Name: ${member.displayName}`,
      `• ID: ${member.user.id}`,
      `• Bot: ${member.user.bot ? 'Yes' : 'No'}`,
      `• Joined Server: <t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:D>`,
      `• Account Created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
      `• In Voice: ${member.voice.channelId ? `**${member.voice.channel?.name}**` : 'No'}`,
      `• Timed Out: ${timedOut ? `Yes — until <t:${Math.floor(timeoutUntil!.getTime() / 1000)}:F>` : 'No'}`,
      `• Nickname: ${member.nickname ?? 'None'}`,
      `• Roles (${member.roles.cache.size - 1}): ${roles}`,
    ];

    return { success: true, message: lines.join('\n') };
  }
}
