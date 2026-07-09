import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_message',
    description: 'Deletes a specific message by its ID from a channel.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the message' },
        messageId: { type: 'string', description: 'ID of the message to delete' },
        reason: { type: 'string', description: 'Reason for deletion (optional)' },
      },
      required: ['channelName', 'messageId'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the message. This cannot be undone.',
    examples: ['Delete message 123456789 from #general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const messageId = String(params['messageId'] ?? '').trim();

    if (!channelName) return { success: false, message: 'Channel name is required' };
    if (!messageId) return { success: false, message: 'Message ID is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
      return { success: true, message: `Deleted message from **#${channel.name}**` };
    } catch {
      return { success: false, message: `Message "${messageId}" not found in #${channel.name}` };
    }
  }
}
