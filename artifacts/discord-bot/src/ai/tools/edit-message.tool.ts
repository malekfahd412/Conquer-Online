import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EditMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_message',
    description: 'Edits the content of a message sent by the bot in a specified channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID where the message is' },
        message_id: { type: 'string', description: 'The message ID to edit' },
        content: { type: 'string', description: 'New content for the message' },
      },
      required: ['channel', 'message_id', 'content'],
    },
    dangerous: false,
    examples: ['Edit message 123456789 in #announcements with new content', 'Update bot message in general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const content = String(params['content'] ?? '').trim();
    if (!content) return { success: false, message: 'Content is required' };

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    );
    if (!ch || !ch.isTextBased()) return { success: false, message: `Channel "${params['channel']}" not found` };

    try {
      const msg = await (ch as { messages: { fetch(id: string): Promise<{ edit(c: string): Promise<unknown>; author: { id: string } }> } }).messages.fetch(messageId);
      const clientId = guild.client.user?.id;
      if (msg.author.id !== clientId) return { success: false, message: 'Can only edit messages sent by this bot' };
      await msg.edit(content);
      return { success: true, message: `✅ Message \`${messageId}\` edited in **#${ch.name}**` };
    } catch {
      return { success: false, message: `Message \`${messageId}\` not found in that channel` };
    }
  }
}
