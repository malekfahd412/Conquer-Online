import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_channel',
    description: 'Creates a text or voice channel, optionally inside a category.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name' },
        type: { type: 'string', enum: ['text', 'voice', 'announcement'], description: 'Channel type (default: text)' },
        category: { type: 'string', description: 'Name of the category to place the channel in (optional)' },
        topic: { type: 'string', description: 'Channel topic/description (optional, text only)' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Channel name is required' };

    const typeStr = String(params['type'] ?? 'text').toLowerCase();
    const channelType =
      typeStr === 'voice' ? ChannelType.GuildVoice
      : typeStr === 'announcement' ? ChannelType.GuildAnnouncement
      : ChannelType.GuildText;

    let parent: CategoryChannel | undefined;
    const categoryName = params['category'] ? String(params['category']).trim().toLowerCase() : null;
    if (categoryName) {
      const found = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName,
      );
      if (!found) return { success: false, message: `Category "${params['category']}" not found` };
      parent = found as CategoryChannel;
    }

    const channel = await guild.channels.create({
      name,
      type: channelType,
      parent: parent?.id,
      topic: channelType === ChannelType.GuildText && params['topic'] ? String(params['topic']) : undefined,
    });

    const location = parent ? ` in **${parent.name}**` : '';
    return { success: true, message: `Created ${typeStr} channel **#${channel.name}**${location}` };
  }
}
