import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { staffEventBus } from '../../community/staff/staff-events';

export class DeafenVoiceMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'deafen_voice_member',
    description: 'Server-deafens a member in voice (they cannot hear anything). This is a server-side deafen.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member to deafen' },
        reason: { type: 'string', description: 'Reason for deafening (optional)' },
      },
      required: ['username'],
    },
    dangerous: false,
    examples: ['Deafen PlayerOne in voice', 'Server deafen DragonSlayer'],
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
    if (member.voice.serverDeaf) return { success: false, message: `${member.user.tag} is already server-deafened` };

    await member.voice.setDeaf(true, params['reason'] ? String(params['reason']) : undefined);
    if (executorId) {
      staffEventBus.emitAction({ guildId: guild.id, userId: executorId, action: 'voice_mod_action', detail: `Server-deafened ${member.user.tag}` });
    }
    return { success: true, message: `🔕 Server-deafened **${member.user.tag}** in voice` };
  }
}
