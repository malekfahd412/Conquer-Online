import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetChannelNsfwTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_channel_nsfw',
    description: 'Enables or disables the NSFW (age-restricted) flag on a text channel.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel' },
        nsfw: { type: 'string', enum: ['true', 'false'], description: 'Enable (true) or disable (false) NSFW' },
      },
      required: ['name', 'nsfw'],
    },
    dangerous: false,
    examples: ['Mark #adult-content as NSFW', 'Remove NSFW flag from #memes'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${params['name']}" not found` };

    const nsfw = params['nsfw'] === 'true';
    await channel.setNSFW(nsfw);

    return {
      success: true,
      message: `**#${channel.name}** is now ${nsfw ? '🔞 NSFW (age-restricted)' : '✅ not NSFW'}`,
    };
  }
}
