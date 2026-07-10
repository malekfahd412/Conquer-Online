import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListThreadsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_threads',
    description: 'Lists all active (and optionally archived) threads in the server.',
    parameters: {
      type: 'object',
      properties: {
        include_archived: { type: 'string', enum: ['true', 'false'], description: 'Include archived threads (default: false)' },
        channel: { type: 'string', description: 'Only list threads in this channel (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['List all threads', 'Show threads in #general', 'List archived threads'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const includeArchived = params['include_archived'] === 'true';
    const channelFilter = params['channel'] ? String(params['channel']).trim().toLowerCase() : null;

    const THREAD_TYPES = new Set([
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ]);

    let threads = guild.channels.cache.filter(c => THREAD_TYPES.has(c.type as ChannelType)) as Map<string, ThreadChannel>;

    if (!includeArchived) {
      threads = new Map([...threads].filter(([, t]) => !t.archived));
    }

    if (channelFilter) {
      threads = new Map([...threads].filter(([, t]) => {
        const parent = t.parentId ? guild.channels.cache.get(t.parentId) : null;
        return parent && parent.name.toLowerCase() === channelFilter;
      }));
    }

    if (threads.size === 0) {
      return { success: false, message: 'No threads found matching the criteria' };
    }

    const lines = Array.from(threads.values()).map(t => {
      const status = t.archived ? '📦 archived' : t.locked ? '🔒 locked' : '💬 active';
      const parent = t.parentId ? guild.channels.cache.get(t.parentId) : null;
      return `• **${t.name}** (${status})${parent ? ` in #${parent.name}` : ''}`;
    });

    return {
      success: true,
      message: `**${threads.size} thread(s):**\n${lines.join('\n')}`,
    };
  }
}
