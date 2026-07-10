import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface ImportStickerRecord {
  name: string;
  url: string;
  tags?: string;
  description?: string;
}

export class ImportStickerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_sticker',
    description: 'Imports one or more stickers into the server from a JSON array of {name, url, tags, description} records (as produced by export_sticker).',
    parameters: {
      type: 'object',
      properties: {
        stickersJson: { type: 'string', description: 'JSON array string of sticker records' },
      },
      required: ['stickersJson'],
    },
    dangerous: false,
    examples: ['Import this sticker JSON export'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    let records: ImportStickerRecord[];
    try {
      records = JSON.parse(String(params['stickersJson'] ?? '[]')) as ImportStickerRecord[];
    } catch {
      return { success: false, message: 'stickersJson is not valid JSON' };
    }
    if (!Array.isArray(records) || records.length === 0) return { success: false, message: 'No sticker records to import' };

    await guild.stickers.fetch();
    const created: string[] = [];
    const skipped: string[] = [];

    for (const record of records.slice(0, 10)) {
      const name = String(record?.name ?? '').trim();
      const url = String(record?.url ?? '').trim();
      if (!name || !url) { skipped.push('(invalid record)'); continue; }
      if (guild.stickers.cache.some(s => s.name.toLowerCase() === name.toLowerCase())) { skipped.push(name); continue; }

      try {
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const sticker = await guild.stickers.create({
          file: buffer,
          name,
          tags: record.tags ?? name,
          description: record.description,
          reason: 'Imported via AI Control Center',
        });
        created.push(sticker.name);
      } catch {
        skipped.push(name);
      }
    }

    return {
      success: created.length > 0,
      message: `Imported ${created.length} sticker(s)${created.length ? `: ${created.join(', ')}` : ''}${skipped.length ? `. Skipped: ${skipped.join(', ')}` : ''}`,
      data: { created, skipped },
    };
  }
}
