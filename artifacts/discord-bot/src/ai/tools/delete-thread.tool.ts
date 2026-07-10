import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_thread',
    description: 'Permanently deletes a thread.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the thread to delete' },
        reason: { type: 'string', description: 'Reason for deletion (optional)' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the thread and all its messages.',
    examples: ['Delete the spam-thread thread', 'Remove the old event thread'],
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

    const threadName = thread.name;
    await thread.delete(params['reason'] ? String(params['reason']) : undefined);
    return { success: true, message: `🗑️ Deleted thread **${threadName}**` };
  }
}
