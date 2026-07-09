import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MoveChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'move_channel',
    description: 'Moves a channel into a different category, or removes it from its current category.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel to move' },
        targetCategory: { type: 'string', description: 'Name of the category to move it into. Leave empty to remove from category.' },
      },
      required: ['channelName'],
    },
    dangerous: false,
    examples: ['Move #general to the Community category', 'Remove #bot-commands from its category'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    if (!channelName) return { success: false, message: 'Channel name is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type !== ChannelType.GuildCategory,
    ) as GuildChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${channelName}" not found` };

    const targetCategoryName = params['targetCategory'] ? String(params['targetCategory']).trim() : null;

    if (!targetCategoryName) {
      await channel.setParent(null);
      return { success: true, message: `Removed **#${channel.name}** from its category` };
    }

    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === targetCategoryName.toLowerCase(),
    ) as CategoryChannel | undefined;

    if (!category) return { success: false, message: `Category "${targetCategoryName}" not found` };

    await channel.setParent(category.id, { lockPermissions: false });
    return { success: true, message: `Moved **#${channel.name}** to **${category.name}**` };
  }
}
