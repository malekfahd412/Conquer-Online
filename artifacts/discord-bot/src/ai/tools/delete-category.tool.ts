import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_category',
    description: 'Deletes an existing category from the server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Deletes the category permanently.',
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    );

    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    await category.delete();
    return { success: true, message: `Deleted category **${category.name}**` };
  }
}
