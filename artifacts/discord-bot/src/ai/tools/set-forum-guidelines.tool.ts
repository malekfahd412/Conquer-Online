import { ChannelType } from 'discord.js';
import type { Guild, ForumChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetForumGuidelinesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_forum_guidelines',
    description: 'Sets the guidelines/topic text for a forum channel shown to members before posting.',
    parameters: {
      type: 'object',
      properties: {
        forum: { type: 'string', description: 'Name of the forum channel' },
        guidelines: { type: 'string', description: 'Guidelines text. Leave empty to clear.' },
      },
      required: ['forum'],
    },
    dangerous: false,
    examples: ['Set #suggestions forum guidelines to "Please follow the format: Title | Description | Priority"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const forumName = String(params['forum'] ?? '').trim().toLowerCase();
    const forum = guild.channels.cache.find(
      c => c.type === ChannelType.GuildForum && c.name.toLowerCase() === forumName,
    ) as ForumChannel | undefined;

    if (!forum) return { success: false, message: `Forum channel "${params['forum']}" not found` };

    const guidelines = params['guidelines'] ? String(params['guidelines']).trim() : null;
    await forum.setTopic(guidelines);

    return {
      success: true,
      message: guidelines
        ? `Set guidelines for **${forum.name}**: "${guidelines}"`
        : `Cleared guidelines for **${forum.name}**`,
    };
  }
}
