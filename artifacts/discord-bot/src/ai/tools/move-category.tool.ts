import { ChannelType } from 'discord.js';
import type { Guild, CategoryChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MoveCategoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'move_category',
    description: 'Moves a category to a new position in the channel list.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category to move' },
        position: { type: 'string', description: 'New position (0 = top). Or use "up" / "down" to move one step.' },
      },
      required: ['name', 'position'],
    },
    dangerous: false,
    examples: ['Move the Events category to position 0', 'Move VIP category up'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as CategoryChannel | undefined;
    if (!category) return { success: false, message: `Category "${params['name']}" not found` };

    const posStr = String(params['position'] ?? '').toLowerCase().trim();
    let newPos: number;

    if (posStr === 'up') {
      newPos = Math.max(0, category.position - 1);
    } else if (posStr === 'down') {
      newPos = category.position + 1;
    } else {
      newPos = parseInt(posStr, 10);
      if (isNaN(newPos) || newPos < 0) return { success: false, message: 'Position must be a non-negative number, "up", or "down"' };
    }

    await category.setPosition(newPos);
    return { success: true, message: `Moved category **${category.name}** to position ${newPos}` };
  }
}
