import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MoveVoiceMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'move_voice_member',
    description: 'Moves a member from one voice channel to another.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to move' },
        channel: { type: 'string', description: 'Name of the destination voice channel' },
      },
      required: ['username', 'channel'],
    },
    dangerous: false,
    examples: ['Move PlayerOne to the VIP voice channel', 'Move DragonSlayer to Gaming'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim().toLowerCase();
    const channelName = String(params['channel'] ?? '').trim().toLowerCase();

    const members = await guild.members.fetch();
    const member = members.find(
      m => m.user.username.toLowerCase() === username ||
        m.displayName.toLowerCase() === username ||
        m.user.tag.toLowerCase() === username,
    );

    if (!member) return { success: false, message: `Member "${params['username']}" not found` };
    if (!member.voice.channelId) return { success: false, message: `${member.user.tag} is not in a voice channel` };

    const dest = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === channelName,
    );
    if (!dest) return { success: false, message: `Voice channel "${params['channel']}" not found` };

    await member.voice.setChannel(dest.id);
    return { success: true, message: `Moved **${member.user.tag}** to **${dest.name}**` };
  }
}
