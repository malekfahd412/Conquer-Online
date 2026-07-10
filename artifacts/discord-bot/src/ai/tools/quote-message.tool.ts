import type { Guild, TextChannel } from 'discord.js';
import { ChannelType, EmbedBuilder } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class QuoteMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'quote_message',
    description: 'Quotes an existing message as an embed, optionally adding a comment, and sends it to a channel.',
    parameters: {
      type: 'object',
      properties: {
        source_channel: { type: 'string', description: 'Channel name or ID where the original message is' },
        message_id: { type: 'string', description: 'Message ID to quote' },
        target_channel: { type: 'string', description: 'Channel to post the quote in (defaults to same channel)' },
        comment: { type: 'string', description: 'Optional comment to add above the quote' },
      },
      required: ['source_channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Quote message 123456 from #general in #quotes', 'Quote this message with comment "Great point!"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const srcQuery = String(params['source_channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const dstQuery = String(params['target_channel'] ?? '').toLowerCase().trim() || srcQuery;
    const comment = String(params['comment'] ?? '').trim();

    const srcCh = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === srcQuery || c.name.toLowerCase() === srcQuery),
    ) as TextChannel | undefined;
    if (!srcCh) return { success: false, message: `Source channel "${params['source_channel']}" not found` };

    const dstCh = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === dstQuery || c.name.toLowerCase() === dstQuery),
    ) as TextChannel | undefined;
    if (!dstCh) return { success: false, message: 'Target channel not found' };

    const msg = await srcCh.messages.fetch(messageId);
    const embed = new EmbedBuilder()
      .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
      .setDescription(msg.content || '*[No text content]*')
      .setFooter({ text: `#${srcCh.name} • ${msg.url}` })
      .setTimestamp(msg.createdAt)
      .setColor(0x5865f2);

    await dstCh.send({ content: comment || undefined, embeds: [embed] });
    return { success: true, message: `✅ Message quoted in **#${dstCh.name}**` };
  }
}
