import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_message',
    description: 'Copies an existing message\'s text content and resends it (optionally to a different channel). Preserves the text; embeds are cloned separately via clone_embed.',
    parameters: {
      type: 'object',
      properties: {
        source_channel: { type: 'string', description: 'Channel name or ID where the original message is' },
        message_id: { type: 'string', description: 'Message ID to clone' },
        target_channel: { type: 'string', description: 'Channel to send the clone to (defaults to same channel)' },
      },
      required: ['source_channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Clone message 123456 from #general to #archive', 'Duplicate message 987654 in the same channel'],
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
    if (!msg.content && msg.embeds.length === 0) return { success: false, message: 'Message has no text content to clone. Use clone_embed for embed-only messages.' };

    await dstCh.send(msg.content || '[No text content]');
    return { success: true, message: `✅ Message cloned to **#${dstCh.name}**` };
  }
}
