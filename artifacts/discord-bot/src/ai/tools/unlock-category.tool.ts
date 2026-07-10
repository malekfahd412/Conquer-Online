import { ChannelType } from 'discord.js';
import type { Guild, TextChannel, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnlockCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unlock_category',
    description: 'Unlocks all text channels inside a category, allowing @everyone to send messages again.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to unlock' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Unlock the General category', 'Open all channels in Events'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as CategoryChannel | undefined;

    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    const textChannels = guild.channels.cache.filter(
      c => (c as { parentId?: string | null }).parentId === category.id && c.type === ChannelType.GuildText,
    ) as Map<string, TextChannel>;

    if (textChannels.size === 0) {
      return { success: false, message: `No text channels found in category **${category.name}**` };
    }

    for (const ch of textChannels.values()) {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    }

    return {
      success: true,
      message: `🔓 Unlocked **${textChannels.size}** text channel(s) in category **${category.name}**`,
    };
  }
}
