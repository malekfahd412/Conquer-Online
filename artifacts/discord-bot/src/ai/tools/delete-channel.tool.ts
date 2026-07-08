import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_channel',
    description: 'Deletes a channel from the server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Deletes the channel and all its messages permanently.',
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === name,
    );

    if (!channel) return { success: false, message: `Channel "${params['name']}" not found` };

    await channel.delete();
    return { success: true, message: `Deleted channel **#${channel.name}**` };
  }
}
