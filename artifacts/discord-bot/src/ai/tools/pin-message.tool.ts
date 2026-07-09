import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PinMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'pin_message',
    description: 'Pins or unpins a message in a channel by its ID.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the message' },
        messageId: { type: 'string', description: 'ID of the message to pin or unpin' },
        action: { type: 'string', enum: ['pin', 'unpin'], description: 'Whether to pin or unpin the message' },
      },
      required: ['channelName', 'messageId', 'action'],
    },
    dangerous: false,
    examples: ['Pin message 123456789 in #announcements', 'Unpin message 987654321 from #rules'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const messageId = String(params['messageId'] ?? '').trim();
    const action = String(params['action'] ?? 'pin').toLowerCase();

    if (!channelName) return { success: false, message: 'Channel name is required' };
    if (!messageId) return { success: false, message: 'Message ID is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    try {
      const message = await channel.messages.fetch(messageId);
      if (action === 'unpin') {
        await message.unpin();
        return { success: true, message: `Unpinned message in **#${channel.name}**` };
      } else {
        await message.pin();
        return { success: true, message: `Pinned message in **#${channel.name}**` };
      }
    } catch {
      return { success: false, message: `Message "${messageId}" not found in #${channel.name}` };
    }
  }
}
