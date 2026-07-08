import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_category',
    description: 'Creates a new category in the Discord server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to create' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Category name is required' };

    const category = await guild.channels.create({ name, type: ChannelType.GuildCategory });
    return { success: true, message: `Created category **${category.name}**` };
  }
}
