import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EmojiSearchTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'emoji_search',
    description: 'Searches the server\'s custom emojis by name substring.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to search for in emoji names' },
      },
      required: ['query'],
    },
    dangerous: false,
    examples: ['Search emojis for "cat"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['query'] ?? '').trim().toLowerCase();
    if (!query) return { success: false, message: 'A search query is required' };

    await guild.emojis.fetch();
    const matches = guild.emojis.cache.filter(e => e.name?.toLowerCase().includes(query) ?? false);
    if (matches.size === 0) return { success: true, message: `No emojis found matching "${query}"` };

    const lines = matches.first(25).map(e => `${e.toString()} \`:${e.name}:\` — ${e.animated ? 'animated' : 'static'}`);
    return { success: true, message: `**🔍 Emoji search — "${query}" (${matches.size} match${matches.size === 1 ? '' : 'es'})**\n${lines.join('\n')}` };
  }
}
