import { ChannelType } from 'discord.js';
import type { Guild, ForumChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AddForumTagTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'add_forum_tag',
    description: 'Adds a new tag to a forum channel. Tags help categorize posts.',
    parameters: {
      type: 'object',
      properties: {
        forum: { type: 'string', description: 'Name of the forum channel' },
        tag: { type: 'string', description: 'Tag name to add' },
        emoji: { type: 'string', description: 'Emoji for the tag (optional, e.g. "🎮" or "bug")' },
        moderated: { type: 'string', enum: ['true', 'false'], description: 'Only moderators can apply this tag (optional, default: false)' },
      },
      required: ['forum', 'tag'],
    },
    dangerous: false,
    examples: ['Add a "Bug Report" tag to the #feedback forum', 'Add "Resolved" tag to #support forum'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const forumName = String(params['forum'] ?? '').trim().toLowerCase();
    const forum = guild.channels.cache.find(
      c => c.type === ChannelType.GuildForum && c.name.toLowerCase() === forumName,
    ) as ForumChannel | undefined;

    if (!forum) return { success: false, message: `Forum channel "${params['forum']}" not found` };

    const tagName = String(params['tag'] ?? '').trim();
    if (!tagName) return { success: false, message: 'Tag name is required' };

    if (forum.availableTags.length >= 20) {
      return { success: false, message: `Forum **${forum.name}** already has the maximum of 20 tags` };
    }

    const existing = forum.availableTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (existing) return { success: false, message: `Tag "${tagName}" already exists in **${forum.name}**` };

    const newTag: Parameters<typeof forum.setAvailableTags>[0][number] = {
      name: tagName,
      moderated: params['moderated'] === 'true',
    };

    if (params['emoji']) {
      const emojiStr = String(params['emoji']).trim();
      if (emojiStr.length <= 2) {
        newTag.emoji = { name: emojiStr, id: null };
      }
    }

    await forum.setAvailableTags([...forum.availableTags, newTag]);
    return { success: true, message: `Added tag **"${tagName}"** to forum **${forum.name}**` };
  }
}
