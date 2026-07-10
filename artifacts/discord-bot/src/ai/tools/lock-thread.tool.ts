import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class LockThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'lock_thread',
    description: 'Locks a thread so only moderators can send messages in it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the thread to lock' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Lock the event-planning thread', 'Lock the old-announcements thread'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const thread = guild.channels.cache.find(
      c =>
        (c.type === ChannelType.PublicThread ||
          c.type === ChannelType.PrivateThread ||
          c.type === ChannelType.AnnouncementThread) &&
        c.name.toLowerCase() === name,
    ) as ThreadChannel | undefined;

    if (!thread) return { success: false, message: `Thread "${params['name']}" not found` };
    if (thread.locked) return { success: false, message: `Thread **${thread.name}** is already locked` };

    await thread.setLocked(true);
    return { success: true, message: `🔒 Locked thread **${thread.name}** — only moderators can post` };
  }
}
