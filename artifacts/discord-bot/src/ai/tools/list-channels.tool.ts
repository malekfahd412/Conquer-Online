import { ChannelType } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListChannelsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_channels',
    description: 'Lists all channels in the server, optionally filtered by type or category.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['text', 'voice', 'category', 'forum', 'stage', 'announcement', 'all'], description: 'Filter by channel type (default: all)' },
        category: { type: 'string', description: 'Only list channels in this category (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['List all voice channels', 'What channels are in the General category?', 'List all text channels'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const typeFilter = String(params['type'] ?? 'all').toLowerCase();
    const categoryFilter = params['category'] ? String(params['category']).trim().toLowerCase() : null;

    const TYPE_MAP: Record<string, ChannelType[]> = {
      text: [ChannelType.GuildText],
      voice: [ChannelType.GuildVoice],
      category: [ChannelType.GuildCategory],
      forum: [ChannelType.GuildForum],
      stage: [ChannelType.GuildStageVoice],
      announcement: [ChannelType.GuildAnnouncement],
      all: [],
    };

    const allowedTypes = TYPE_MAP[typeFilter] ?? [];

    let channels = guild.channels.cache.filter(c => {
      if (allowedTypes.length > 0 && !allowedTypes.includes(c.type as ChannelType)) return false;
      if (categoryFilter) {
        const parent = c.parentId ? guild.channels.cache.get(c.parentId) : null;
        if (!parent || parent.name.toLowerCase() !== categoryFilter) return false;
      }
      return true;
    }) as Map<string, GuildChannel>;

    if (channels.size === 0) return { success: false, message: 'No channels found matching the criteria' };

    const sorted = Array.from(channels.values()).sort((a, b) => a.position - b.position);
    const lines = sorted.map(c => {
      const prefix = c.type === ChannelType.GuildVoice ? '🔊' : c.type === ChannelType.GuildCategory ? '📁' : c.type === ChannelType.GuildForum ? '💬' : '#';
      return `${prefix} ${c.name} (${c.id})`;
    });

    return {
      success: true,
      message: `**${channels.size} channel(s)${categoryFilter ? ` in "${params['category']}"` : ''}:**\n${lines.join('\n')}`,
    };
  }
}
