import type { Guild, TextChannel } from 'discord.js';
import { ChannelType, EmbedBuilder } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneEmbedTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_embed',
    description: 'Clones the embed(s) from an existing message and resends them in the same or a different channel.',
    parameters: {
      type: 'object',
      properties: {
        source_channel: { type: 'string', description: 'Channel name or ID where the original message is' },
        message_id: { type: 'string', description: 'Message ID containing the embed(s)' },
        target_channel: { type: 'string', description: 'Channel to send the cloned embed to (defaults to same channel)' },
      },
      required: ['source_channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Clone embed from message 123456 in #announcements to #archive', 'Duplicate embed message 987654'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const srcQuery = String(params['source_channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const dstQuery = String(params['target_channel'] ?? '').toLowerCase().trim() || srcQuery;

    const srcCh = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === srcQuery || c.name.toLowerCase() === srcQuery),
    ) as TextChannel | undefined;
    if (!srcCh) return { success: false, message: `Source channel "${params['source_channel']}" not found` };

    const dstCh = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === dstQuery || c.name.toLowerCase() === dstQuery),
    ) as TextChannel | undefined;
    if (!dstCh) return { success: false, message: `Target channel not found` };

    const msg = await srcCh.messages.fetch(messageId);
    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds to clone' };

    const embeds = msg.embeds.map(e => EmbedBuilder.from(e));
    await dstCh.send({ embeds });
    return { success: true, message: `✅ Cloned ${embeds.length} embed(s) to **#${dstCh.name}**` };
  }
}
