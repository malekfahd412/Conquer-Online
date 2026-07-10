import type { Guild, NewsChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CrosspostMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'crosspost_message',
    description: 'Publishes (crossposts) a message in an Announcement channel so it propagates to all servers following that channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Announcement channel name or ID' },
        message_id: { type: 'string', description: 'Message ID to crosspost/publish' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Publish message 123456 in #announcements', 'Crosspost the latest message in news channel'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildAnnouncement &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as NewsChannel | undefined;
    if (!ch) return { success: false, message: `Announcement channel "${params['channel']}" not found. Only Announcement-type channels can crosspost.` };

    try {
      const msg = await ch.messages.fetch(messageId);
      await msg.crosspost();
      return { success: true, message: `📢 Message \`${messageId}\` published in **#${ch.name}** — propagating to all following servers` };
    } catch (e) {
      return { success: false, message: `Could not crosspost: ${String(e)}` };
    }
  }
}
