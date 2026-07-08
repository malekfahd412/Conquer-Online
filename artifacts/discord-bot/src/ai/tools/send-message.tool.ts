import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SendMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_message',
    description: 'Sends a plain text message to a channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Name of the channel to send the message to' },
        content: { type: 'string', description: 'Message content' },
      },
      required: ['channel', 'content'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channel'] ?? '').trim().toLowerCase();
    const content = String(params['content'] ?? '').trim();

    if (!content) return { success: false, message: 'Message content is required' };

    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase() === channelName,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${params['channel']}" not found` };

    await channel.send(content);
    return { success: true, message: `Sent message to **#${channel.name}**` };
  }
}
