import type { Guild, TextChannel } from 'discord.js';
import { ChannelType, EmbedBuilder } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ForwardMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'forward_message',
    description: 'Forwards a message (text + embeds) from one channel to another, with attribution to the original author.',
    parameters: {
      type: 'object',
      properties: {
        source_channel: { type: 'string', description: 'Channel name or ID where the original message is' },
        message_id: { type: 'string', description: 'Message ID to forward' },
        target_channel: { type: 'string', description: 'Channel to forward the message to' },
      },
      required: ['source_channel', 'message_id', 'target_channel'],
    },
    dangerous: false,
    examples: ['Forward message 123456 from #suggestions to #approved', 'Forward this report to #staff-logs'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const srcQuery = String(params['source_channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const dstQuery = String(params['target_channel'] ?? '').toLowerCase().trim();

    const srcCh = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === srcQuery || c.name.toLowerCase() === srcQuery),
    ) as TextChannel | undefined;
    if (!srcCh) return { success: false, message: `Source channel "${params['source_channel']}" not found` };

    const dstCh = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === dstQuery || c.name.toLowerCase() === dstQuery),
    ) as TextChannel | undefined;
    if (!dstCh) return { success: false, message: `Target channel "${params['target_channel']}" not found` };

    const msg = await srcCh.messages.fetch(messageId);

    const forwardEmbed = new EmbedBuilder()
      .setAuthor({ name: `Forwarded from #${srcCh.name}`, iconURL: msg.author.displayAvatarURL() })
      .setDescription(msg.content || '*[No text content]*')
      .setFooter({ text: `Originally by ${msg.author.username} • ${msg.url}` })
      .setTimestamp(msg.createdAt)
      .setColor(0x57f287);

    const embeds = [forwardEmbed, ...msg.embeds.map(e => EmbedBuilder.from(e))];
    await dstCh.send({ embeds });

    return { success: true, message: `✅ Message forwarded from **#${srcCh.name}** → **#${dstCh.name}**` };
  }
}
