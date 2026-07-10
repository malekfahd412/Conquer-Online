import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnlockThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unlock_thread',
    description: 'Unlocks a locked thread, allowing all members to send messages again.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the thread to unlock' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Unlock the event-planning thread', 'Open the suggestions thread again'],
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
    if (!thread.locked) return { success: false, message: `Thread **${thread.name}** is not locked` };

    await thread.setLocked(false);
    return { success: true, message: `🔓 Unlocked thread **${thread.name}** — everyone can post again` };
  }
}
