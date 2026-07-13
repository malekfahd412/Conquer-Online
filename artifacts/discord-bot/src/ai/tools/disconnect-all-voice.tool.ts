import { ChannelType } from 'discord.js';
import type { Guild, VoiceChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { staffEventBus } from '../../community/staff/staff-events';

export class DisconnectAllVoiceTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'disconnect_all_voice',
    description: 'Disconnects all members from a specific voice channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Name of the voice channel to clear' },
        reason: { type: 'string', description: 'Reason for disconnection (optional)' },
      },
      required: ['channel'],
    },
    dangerous: true,
    dangerDescription: 'Forcibly disconnects every member from the specified voice channel.',
    examples: ['Disconnect everyone from the AFK channel', 'Clear the Gaming voice channel'],
  };

  async execute(params: Record<string, unknown>, guild: Guild, executorId?: string): Promise<ToolExecuteResult> {
    const channelName = String(params['channel'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === channelName,
    ) as VoiceChannel | undefined;

    if (!channel) return { success: false, message: `Voice channel "${params['channel']}" not found` };

    const members = channel.members;
    if (members.size === 0) return { success: false, message: `No members are in **${channel.name}**` };

    const reason = params['reason'] ? String(params['reason']) : undefined;
    let count = 0;
    for (const member of members.values()) {
      await member.voice.setChannel(null, reason);
      count++;
    }

    if (executorId) {
      staffEventBus.emitAction({ guildId: guild.id, userId: executorId, action: 'voice_mod_action', detail: `Disconnected ${count} member(s) from ${channel.name}` });
    }
    return { success: true, message: `🚪 Disconnected **${count}** member(s) from **${channel.name}**` };
  }
}
