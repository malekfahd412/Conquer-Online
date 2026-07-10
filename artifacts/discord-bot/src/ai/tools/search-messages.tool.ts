import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SearchMessagesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'search_messages',
    description: 'Searches recent messages in a channel for a keyword or phrase. Returns matching messages with author, timestamp, and link.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to search in' },
        query: { type: 'string', description: 'Keyword or phrase to search for' },
        limit: { type: 'string', description: 'Number of recent messages to scan (default 100, max 500)' },
        author: { type: 'string', description: 'Filter by author username or ID (optional)' },
      },
      required: ['channel', 'query'],
    },
    dangerous: false,
    examples: ['Search for "event" in #announcements', 'Find messages containing "banned" in #mod-log', 'Search messages by JohnDoe in #general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const query = String(params['query'] ?? '').toLowerCase().trim();
    const limit = Math.min(500, Math.max(10, parseInt(String(params['limit'] ?? '100'), 10) || 100));
    const authorQuery = String(params['author'] ?? '').toLowerCase().trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const messages = await ch.messages.fetch({ limit: Math.min(limit, 100) });
    const matches = messages.filter(m => {
      if (!m.content.toLowerCase().includes(query)) return false;
      if (authorQuery && m.author.id !== authorQuery && !m.author.username.toLowerCase().includes(authorQuery)) return false;
      return true;
    });

    if (matches.size === 0) return { success: true, message: `No messages found matching **"${query}"** in **#${ch.name}**` };

    const lines = matches.first(10).map(m =>
      `• <t:${Math.floor(m.createdTimestamp / 1000)}:R> **${m.author.username}**: "${m.content.slice(0, 80)}${m.content.length > 80 ? '...' : ''}" — [Jump](${m.url})`,
    );

    return {
      success: true,
      message: `**🔍 Found ${matches.size} message(s) in #${ch.name} matching "${query}":**\n${lines.join('\n')}`,
    };
  }
}
