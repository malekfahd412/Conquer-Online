import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class OptimizeCategoriesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'optimize_categories',
    description: 'Analyzes category organization and suggests improvements: consolidating small categories, splitting large ones, alphabetical sorting options.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
    const suggestions: string[] = [];

    for (const [, cat] of categories) {
      const children = guild.channels.cache.filter(c => 'parentId' in c && (c as { parentId?: string }).parentId === cat.id);
      if (children.size === 0) suggestions.push(`🗑️ **${cat.name}** is empty — consider deleting it`);
      else if (children.size === 1) suggestions.push(`📦 **${cat.name}** has only 1 channel — consider moving it to another category`);
      else if (children.size > 10) suggestions.push(`✂️ **${cat.name}** has ${children.size} channels — consider splitting into sub-categories`);
    }

    const catNames = [...categories.values()].map(c => c.name.toLowerCase());
    const sorted = [...catNames].sort();
    const isAlphabetical = catNames.every((n, i) => n === sorted[i]);
    if (!isAlphabetical && categories.size > 3) {
      suggestions.push(`🔤 Categories are not alphabetically sorted — use \`set_channel_position\` to reorder`);
    }

    // Check for similar names
    const unique = new Set(catNames);
    if (unique.size < catNames.length) suggestions.push(`⚠️ Duplicate category names detected — use \`duplicate_resource_detection\` for details`);

    const lines = [
      `📁 **Category Optimization Report** — **${guild.name}**`,
      `Total categories: ${categories.size}`,
      '',
      suggestions.length > 0 ? `**${suggestions.length} Suggestion(s):**\n${suggestions.join('\n')}` : '✅ Category structure looks well-organized!',
    ];

    return { success: true, message: lines.join('\n') };
  }
}
