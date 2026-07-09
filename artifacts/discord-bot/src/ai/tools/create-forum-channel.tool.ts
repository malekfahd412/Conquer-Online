import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateForumChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_forum_channel',
    description: 'Creates a Discord Forum channel where members can create posts and have threaded discussions.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Forum channel name' },
        topic: { type: 'string', description: 'Forum channel topic or guidelines (optional)' },
        category: { type: 'string', description: 'Name of the category to place the forum in (optional)' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Create a forum channel called bug-reports', 'Create a #suggestions forum in the Community category'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Forum channel name is required' };

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
      type: ChannelType.GuildForum,
      parent: parent?.id,
      topic: params['topic'] ? String(params['topic']) : undefined,
    });

    const location = parent ? ` in **${parent.name}**` : '';
    return { success: true, message: `Created forum channel **#${channel.name}**${location}` };
  }
}
