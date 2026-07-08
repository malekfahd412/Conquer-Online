import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_channel',
    description: 'Renames an existing channel.',
    parameters: {
      type: 'object',
      properties: {
        current_name: { type: 'string', description: 'Current channel name' },
        new_name: { type: 'string', description: 'New channel name' },
      },
      required: ['current_name', 'new_name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const currentName = String(params['current_name'] ?? '').trim().toLowerCase();
    const newName = String(params['new_name'] ?? '').trim();

    const channel = guild.channels.cache.find(
      c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === currentName,
    );

    if (!channel) return { success: false, message: `Channel "${params['current_name']}" not found` };
    if (!newName) return { success: false, message: 'New name is required' };

    await channel.setName(newName);
    return { success: true, message: `Renamed channel to **#${newName}**` };
  }
}
