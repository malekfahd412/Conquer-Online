import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SlowmodeChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_slowmode',
    description: 'Sets slowmode on a text channel (0 to disable).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name' },
        seconds: { type: 'number', description: 'Slowmode delay in seconds (0 = disabled, max 21600)', minimum: 0, maximum: 21600 },
      },
      required: ['name', 'seconds'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const seconds = Number(params['seconds'] ?? 0);

    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      return { success: false, message: 'Slowmode must be between 0 and 21600 seconds' };
    }

    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${params['name']}" not found` };

    await channel.setRateLimitPerUser(seconds);

    const label = seconds === 0 ? 'disabled' : `${seconds}s`;
    return { success: true, message: `Set slowmode on **#${channel.name}** to **${label}**` };
  }
}
