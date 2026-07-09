import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ArchiveThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'archive_thread',
    description: 'Archives (closes) an active thread by name.',
    parameters: {
      type: 'object',
      properties: {
        threadName: { type: 'string', description: 'Name of the thread to archive' },
        channelName: { type: 'string', description: 'Name of the parent channel (optional, helps disambiguate)' },
      },
      required: ['threadName'],
    },
    dangerous: false,
    examples: ['Archive the "Event Discussion" thread'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const threadName = String(params['threadName'] ?? '').trim().toLowerCase();
    if (!threadName) return { success: false, message: 'Thread name is required' };

    const channelName = params['channelName'] ? String(params['channelName']).trim().toLowerCase() : null;

    const thread = guild.channels.cache.find(c => {
      if (c.type !== ChannelType.PublicThread && c.type !== ChannelType.PrivateThread) return false;
      if (c.name.toLowerCase() !== threadName) return false;
      if (channelName) {
        const parent = guild.channels.cache.get(c.parentId ?? '');
        if (!parent || parent.name.toLowerCase() !== channelName) return false;
      }
      return !(c as ThreadChannel).archived;
    }) as ThreadChannel | undefined;

    if (!thread) return { success: false, message: `Active thread "${params['threadName']}" not found` };

    await thread.setArchived(true);
    return { success: true, message: `Archived thread **${thread.name}**` };
  }
}
