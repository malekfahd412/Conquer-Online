import { ChannelType } from 'discord.js';
import type { Guild, VoiceChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetVoiceUserLimitTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_voice_user_limit',
    description: 'Sets the maximum number of users allowed in a voice channel (0 = unlimited, max 99).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the voice channel' },
        limit: { type: 'string', description: 'Max users (0–99). Use 0 for unlimited.' },
      },
      required: ['name', 'limit'],
    },
    dangerous: false,
    examples: ['Limit the Gaming channel to 5 users', 'Set VIP voice to 10 users', 'Remove user limit from General voice'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name,
    ) as VoiceChannel | undefined;

    if (!channel) return { success: false, message: `Voice channel "${params['name']}" not found` };

    const limit = parseInt(String(params['limit'] ?? '0'), 10);
    if (isNaN(limit) || limit < 0 || limit > 99) {
      return { success: false, message: 'User limit must be between 0 (unlimited) and 99' };
    }

    await channel.setUserLimit(limit);
    return {
      success: true,
      message: `👥 Set **${channel.name}** user limit to **${limit === 0 ? 'Unlimited' : limit}**`,
    };
  }
}
