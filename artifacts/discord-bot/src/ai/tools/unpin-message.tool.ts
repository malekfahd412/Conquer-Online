import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnpinMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unpin_message',
    description: 'Unpins a specific message in a channel by message ID.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'The message ID to unpin' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Unpin message 123456789 in #general', 'Remove pin from message in announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    );
    if (!ch || !ch.isTextBased()) return { success: false, message: `Channel "${params['channel']}" not found` };

    try {
      const textCh = ch as unknown as { messages: { fetch(id: string): Promise<{ unpin(): Promise<unknown> }> } };
      const msg = await textCh.messages.fetch(messageId);
      await msg.unpin();
      return { success: true, message: `✅ Message \`${messageId}\` unpinned from **#${ch.name}**` };
    } catch {
      return { success: false, message: `Message \`${messageId}\` not found or could not be unpinned` };
    }
  }
}
