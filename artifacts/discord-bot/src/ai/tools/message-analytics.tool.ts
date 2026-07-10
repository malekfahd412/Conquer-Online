import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MessageAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'message_analytics',
    description: 'Analyzes recent messages in a channel: top authors, peak activity hours, average message length, most-used words, reaction counts.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to analyze' },
        limit: { type: 'string', description: 'Number of messages to analyze (default 100, max 100)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Analyze activity in #general', 'Show message stats for #off-topic'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const limit = Math.min(100, Math.max(10, parseInt(String(params['limit'] ?? '100'), 10) || 100));

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const messages = await ch.messages.fetch({ limit });
    if (messages.size === 0) return { success: true, message: `No messages found in **#${ch.name}**` };

    const authorCount = new Map<string, number>();
    const hourCount = new Map<number, number>();
    const wordCount = new Map<string, number>();
    let totalChars = 0;
    let totalReactions = 0;
    let withAttachments = 0;
    let withEmbeds = 0;

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'i', 'you', 'it', 'this', 'that', 'of', 'with', 'have', 'be']);

    for (const m of messages.values()) {
      const author = m.author.username;
      authorCount.set(author, (authorCount.get(author) ?? 0) + 1);
      const hour = m.createdAt.getUTCHours();
      hourCount.set(hour, (hourCount.get(hour) ?? 0) + 1);
      totalChars += m.content.length;
      totalReactions += m.reactions.cache.reduce((sum, r) => sum + r.count, 0);
      if (m.attachments.size > 0) withAttachments++;
      if (m.embeds.length > 0) withEmbeds++;
      for (const word of m.content.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w))) {
        wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
      }
    }

    const topAuthors = [...authorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `  • **${n}**: ${c} messages`).join('\n');
    const topWords = [...wordCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, c]) => `  • "${w}": ${c}x`).join('\n');
    const peakHour = [...hourCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const avgLen = Math.round(totalChars / messages.size);

    const lines = [
      `**📊 Message Analytics — #${ch.name}** (last ${messages.size} messages)`,
      ``,
      `**📝 Overview**`,
      `• Total messages: **${messages.size}**`,
      `• Avg length: **${avgLen} chars**`,
      `• Total reactions: **${totalReactions}**`,
      `• With attachments: **${withAttachments}**`,
      `• With embeds: **${withEmbeds}**`,
      ``,
      `**👤 Top Authors:**`,
      topAuthors,
      ``,
      `**🕐 Peak Hour:** ${peakHour ? `${peakHour[0]}:00 UTC (${peakHour[1]} messages)` : 'N/A'}`,
      ``,
      `**🔤 Top Words:**`,
      topWords || '  • (insufficient data)',
    ];

    return { success: true, message: lines.join('\n') };
  }
}
