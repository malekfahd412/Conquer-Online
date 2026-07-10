import { ChannelType } from 'discord.js';
import type { Guild, VoiceChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetVoiceBitrateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_voice_bitrate',
    description: 'Sets the audio bitrate of a voice channel (8–384 kbps, higher requires server boosts).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the voice channel' },
        bitrate: { type: 'string', description: 'Bitrate in kbps (8–384). Common values: 64, 96, 128, 256, 384' },
      },
      required: ['name', 'bitrate'],
    },
    dangerous: false,
    examples: ['Set Gaming voice bitrate to 128kbps', 'Set Music channel to 256kbps'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name,
    ) as VoiceChannel | undefined;

    if (!channel) return { success: false, message: `Voice channel "${params['name']}" not found` };

    const kbps = parseInt(String(params['bitrate'] ?? '64'), 10);
    if (isNaN(kbps) || kbps < 8 || kbps > 384) {
      return { success: false, message: 'Bitrate must be between 8 and 384 kbps' };
    }

    await channel.setBitrate(kbps * 1000);
    return { success: true, message: `🎧 Set **${channel.name}** bitrate to **${kbps} kbps**` };
  }
}
