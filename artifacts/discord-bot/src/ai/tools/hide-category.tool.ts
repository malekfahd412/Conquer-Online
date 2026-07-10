import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class HideCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'hide_category',
    description: 'Hides a category from @everyone by denying ViewChannel permission.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to hide' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Hide the Staff category', 'Hide VIP from everyone'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as CategoryChannel | undefined;

    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    return { success: true, message: `🙈 Hidden category **${category.name}** — @everyone cannot see it` };
  }
}
