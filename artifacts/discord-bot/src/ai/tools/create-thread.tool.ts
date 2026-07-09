import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_thread',
    description: 'Creates a public thread inside a text channel.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the text channel to create the thread in' },
        threadName: { type: 'string', description: 'Name of the new thread' },
        message: { type: 'string', description: 'Initial message content for the thread (optional)' },
      },
      required: ['channelName', 'threadName'],
    },
    dangerous: false,
    examples: ['Create a thread called "Event Discussion" in #announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const threadName = String(params['threadName'] ?? '').trim();

    if (!channelName) return { success: false, message: 'Channel name is required' };
    if (!threadName) return { success: false, message: 'Thread name is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    let thread;
    if (params['message']) {
      const msg = await channel.send(String(params['message']));
      thread = await msg.startThread({ name: threadName });
    } else {
      thread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: 1440,
      });
    }

    return { success: true, message: `Created thread **${thread.name}** in **#${channel.name}**` };
  }
}
