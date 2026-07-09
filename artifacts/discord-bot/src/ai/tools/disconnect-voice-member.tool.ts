import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DisconnectVoiceMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'disconnect_voice_member',
    description: 'Disconnects a member from their current voice channel.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to disconnect' },
        reason: { type: 'string', description: 'Reason for disconnection (optional)' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Disconnect PlayerOne from voice', 'Remove DragonSlayer99 from their voice channel'],
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
    if (!member.voice.channelId) return { success: false, message: `${member.user.tag} is not in a voice channel` };

    const channelName = member.voice.channel?.name ?? 'voice channel';
    await member.voice.setChannel(null, params['reason'] ? String(params['reason']) : undefined);
    return { success: true, message: `Disconnected **${member.user.tag}** from **${channelName}**` };
  }
}
