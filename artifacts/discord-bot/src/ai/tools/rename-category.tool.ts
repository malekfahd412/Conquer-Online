import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_category',
    description: 'Renames an existing category.',
    parameters: {
      type: 'object',
      properties: {
        current_name: { type: 'string', description: 'Current name of the category' },
        new_name: { type: 'string', description: 'New name for the category' },
      },
      required: ['current_name', 'new_name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const currentName = String(params['current_name'] ?? '').trim().toLowerCase();
    const newName = String(params['new_name'] ?? '').trim();

    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === currentName,
    );

    if (!category) return { success: false, message: `Category "${params['current_name']}" not found` };
    if (!newName) return { success: false, message: 'New name is required' };

    await category.setName(newName);
    return { success: true, message: `Renamed category to **${newName}**` };
  }
}
