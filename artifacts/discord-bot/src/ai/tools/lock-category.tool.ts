import { ChannelType } from 'discord.js';
import type { Guild, TextChannel, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class LockCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'lock_category',
    description: 'Locks all text channels inside a category so @everyone cannot send messages.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to lock' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Lock the General category', 'Lock all channels in Events'],
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
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    }

    return {
      success: true,
      message: `🔒 Locked **${textChannels.size}** text channel(s) in category **${category.name}**`,
    };
  }
}
