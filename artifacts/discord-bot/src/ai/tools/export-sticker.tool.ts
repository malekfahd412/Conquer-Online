import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ExportStickerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_sticker',
    description: 'Exports a custom sticker as a portable JSON record (name, tags, description, image URL) for backup or re-import.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the sticker to export. Leave blank to export all stickers.' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Export the sticker "wave" as JSON', 'Export all stickers'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    await guild.stickers.fetch();

    const targets = name
      ? guild.stickers.cache.filter(s => s.name.toLowerCase() === name)
      : guild.stickers.cache;

    if (targets.size === 0) return { success: false, message: name ? `Sticker "${name}" not found` : 'This server has no custom stickers' };

    const exported = targets.map(s => ({ name: s.name, id: s.id, tags: s.tags, description: s.description, url: s.url }));
    return {
      success: true,
      message: `Exported ${exported.length} sticker record${exported.length === 1 ? '' : 's'}:\n\`\`\`json\n${JSON.stringify(exported, null, 2).slice(0, 1500)}\n\`\`\``,
      data: exported,
    };
  }
}
