import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnarchiveThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unarchive_thread',
    description: 'Unarchives (restores) an archived thread.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the thread to unarchive' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Unarchive the event-planning thread', 'Restore the guild-war thread'],
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
    if (!thread.archived) return { success: false, message: `Thread **${thread.name}** is not archived` };

    await thread.setArchived(false);
    return { success: true, message: `📂 Unarchived thread **${thread.name}**` };
  }
}
