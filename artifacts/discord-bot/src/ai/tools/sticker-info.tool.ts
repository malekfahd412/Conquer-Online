import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class StickerInfoTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'sticker_info',
    description: 'Shows details about a specific custom sticker: id, tags, description, format, and creation date.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the sticker to inspect' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Show info about the sticker "wave"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Sticker name is required' };

    await guild.stickers.fetch();
    const sticker = guild.stickers.cache.find(s => s.name.toLowerCase() === name);
    if (!sticker) return { success: false, message: `Sticker "${name}" not found` };

    const created = sticker.createdTimestamp ? `<t:${Math.floor(sticker.createdTimestamp / 1000)}:R>` : 'Unknown';
    return {
      success: true,
      message: `**${sticker.name}**\n• ID: \`${sticker.id}\`\n• Tags: ${sticker.tags ?? 'None'}\n• Description: ${sticker.description ?? 'None'}\n• Format: ${sticker.format}\n• Created: ${created}\n• URL: ${sticker.url}`,
      data: { id: sticker.id, name: sticker.name, tags: sticker.tags, format: sticker.format },
    };
  }
}
