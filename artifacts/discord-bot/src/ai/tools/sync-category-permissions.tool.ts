import { ChannelType } from 'discord.js';
import type { Guild, GuildChannel, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SyncCategoryPermissionsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'sync_category_permissions',
    description: 'Syncs all channels inside a category to inherit the category\'s permission overrides.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category whose permissions to sync' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Sync permissions in General category', 'Make all Staff channels inherit Staff category perms'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as CategoryChannel | undefined;

    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    const children = guild.channels.cache.filter(
      c => (c as { parentId?: string | null }).parentId === category.id,
    ) as Map<string, GuildChannel>;

    if (children.size === 0) {
      return { success: false, message: `No channels found in category **${category.name}**` };
    }

    for (const ch of children.values()) {
      if ('lockPermissions' in ch && typeof ch.lockPermissions === 'function') {
        await ch.lockPermissions();
      }
    }

    return {
      success: true,
      message: `🔄 Synced permissions for **${children.size}** channel(s) in **${category.name}** to match category`,
    };
  }
}
