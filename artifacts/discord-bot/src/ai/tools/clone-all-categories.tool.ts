import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneAllCategoriesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_all_categories',
    description: 'Clones all categories in the server by creating copies with a suffix. Useful for restructuring or creating a parallel category layout.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix to append to cloned category names (default: "-copy")' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      return { success: false, message: `This will clone ${cats} categor(ies). Set \`confirm: "CONFIRM"\` to proceed.` };
    }
    const suffix = String(params['suffix'] ?? '-copy');
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    const created: string[] = [];
    const failed: string[] = [];

    for (const [, cat] of categories) {
      const newName = `${cat.name}${suffix}`.slice(0, 100);
      try {
        await guild.channels.create({ name: newName, type: ChannelType.GuildCategory, reason: `Clone all categories` });
        created.push(newName);
      } catch { failed.push(cat.name); }
    }

    return {
      success: true,
      message: `✅ Cloned **${created.length}** categor(ies)${failed.length ? `, ${failed.length} failed` : ''}.\nCreated: ${created.map(n => `\`${n}\``).join(', ')}`,
    };
  }
}
