import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { staffEventBus } from '../../community/staff/staff-events';

export class UnmuteVoiceMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unmute_voice_member',
    description: 'Removes the server-mute from a member in voice, allowing them to speak again.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to unmute' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Unmute PlayerOne in voice', 'Let DragonSlayer speak again'],
  };

  async execute(params: Record<string, unknown>, guild: Guild, executorId?: string): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim().toLowerCase();
    const members = await guild.members.fetch();
    const member = members.find(
      m => m.user.username.toLowerCase() === username ||
        m.displayName.toLowerCase() === username ||
        m.user.tag.toLowerCase() === username,
    );

    if (!member) return { success: false, message: `Member "${params['username']}" not found` };
    if (!member.voice.channelId) return { success: false, message: `${member.user.tag} is not in a voice channel` };
    if (!member.voice.serverMute) return { success: false, message: `${member.user.tag} is not server-muted` };

    await member.voice.setMute(false);
    if (executorId) {
      staffEventBus.emitAction({ guildId: guild.id, userId: executorId, action: 'voice_mod_action', detail: `Unmuted ${member.user.tag}` });
    }
    return { success: true, message: `🔊 Unmuted **${member.user.tag}** — they can speak again` };
  }
}
