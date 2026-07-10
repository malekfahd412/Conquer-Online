import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DuplicateResourceDetectionTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'duplicate_resource_detection',
    description: 'Scans the server for duplicate or very similar resource names: channels, roles, emojis, and categories. Flags exact duplicates and near-duplicates.',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Resource type to check: channels, roles, emojis, categories, all (default: all)',
          enum: ['channels', 'roles', 'emojis', 'categories', 'all'],
        },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const res = String(params['resource'] ?? 'all').toLowerCase();
    const lines = [`🔍 **Duplicate Resource Detection** — **${guild.name}**\n`];
    let found = 0;

    const findDupes = <T>(items: T[], getName: (i: T) => string, label: string) => {
      const names: Record<string, T[]> = {};
      for (const item of items) {
        const n = getName(item).toLowerCase().replace(/[-_]/g, '');
        names[n] = [...(names[n] ?? []), item];
      }
      const dupes = Object.entries(names).filter(([, g]) => g.length > 1);
      if (dupes.length > 0) {
        lines.push(`**${label} (${dupes.length} duplicate group(s)):**`);
        for (const [, group] of dupes) {
          lines.push(`  ⚠️ "${getName(group[0])}" — ${group.length} entries`);
        }
        found += dupes.length;
        lines.push('');
      }
    };

    if (res === 'all' || res === 'channels') {
      const textChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => c);
      findDupes(textChs, c => c.name, '📺 Duplicate Channels');
    }
    if (res === 'all' || res === 'roles') {
      findDupes([...guild.roles.cache.values()], r => r.name, '🎭 Duplicate Roles');
    }
    if (res === 'all' || res === 'emojis') {
      findDupes([...guild.emojis.cache.values()], e => e.name ?? '', '😀 Duplicate Emojis');
    }
    if (res === 'all' || res === 'categories') {
      const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => c);
      findDupes(cats, c => c.name, '📁 Duplicate Categories');
    }

    if (found === 0) {
      lines.push('✅ No duplicates found!');
    } else {
      lines.push(`Found **${found}** duplicate group(s) total.`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
