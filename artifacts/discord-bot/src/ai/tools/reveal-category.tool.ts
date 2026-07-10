import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RevealCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'reveal_category',
    description: 'Makes a hidden category visible to @everyone by removing the ViewChannel deny.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to reveal' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Reveal the Events category', 'Show the General category to everyone'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as CategoryChannel | undefined;

    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null });
    return { success: true, message: `👁️ Revealed category **${category.name}** — @everyone can now see it` };
  }
}
