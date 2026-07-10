import { ChannelType } from 'discord.js';
import type { Guild, VoiceChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetVoiceRegionTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_voice_region',
    description: 'Sets the RTC region (server location) for a voice channel. Use "auto" for automatic.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the voice channel' },
        region: {
          type: 'string',
          enum: ['auto', 'us-west', 'us-east', 'us-central', 'us-south', 'singapore', 'southafrica', 'sydney', 'europe', 'brazil', 'hongkong', 'russia', 'japan', 'india'],
          description: 'Region code or "auto" for automatic selection',
        },
      },
      required: ['name', 'region'],
    },
    dangerous: false,
    examples: ['Set Gaming voice region to singapore', 'Set Battle voice to auto region'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name,
    ) as VoiceChannel | undefined;

    if (!channel) return { success: false, message: `Voice channel "${params['name']}" not found` };

    const region = String(params['region'] ?? 'auto').trim();
    await channel.setRTCRegion(region === 'auto' ? null : region);

    return {
      success: true,
      message: `🌐 Set **${channel.name}** region to **${region === 'auto' ? 'Automatic' : region}**`,
    };
  }
}
