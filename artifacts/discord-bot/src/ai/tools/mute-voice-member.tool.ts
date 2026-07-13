import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { staffEventBus } from '../../community/staff/staff-events';

export class MuteVoiceMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'mute_voice_member',
    description: 'Server-mutes a member in voice (they cannot speak). This is a server-side mute, not self-mute.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to mute' },
        reason: { type: 'string', description: 'Reason for muting (optional)' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Server mute PlayerOne', 'Mute DragonSlayer in voice for spamming'],
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
    if (member.voice.serverMute) return { success: false, message: `${member.user.tag} is already server-muted` };

    await member.voice.setMute(true, params['reason'] ? String(params['reason']) : undefined);
    if (executorId) {
      staffEventBus.emitAction({ guildId: guild.id, userId: executorId, action: 'voice_mod_action', detail: `Server-muted ${member.user.tag}` });
    }
    return { success: true, message: `🔇 Server-muted **${member.user.tag}** in voice` };
  }
}
