import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CopyMessageLinkTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'copy_message_link',
    description: 'Returns the direct Discord link (jump URL) to a specific message.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Get link to message 123456 in #announcements', 'Copy message link from general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    try {
      const msg = await ch.messages.fetch(messageId);
      return { success: true, message: `🔗 **Message Link:**\n${msg.url}` };
    } catch {
      const url = `https://discord.com/channels/${guild.id}/${ch.id}/${messageId}`;
      return { success: true, message: `🔗 **Message Link (constructed):**\n${url}` };
    }
  }
}
