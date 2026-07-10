import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface ImportEmojiRecord {
  name: string;
  url: string;
}

export class ImportEmojiTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_emoji',
    description: 'Imports one or more emojis into the server from a JSON array of {name, url} records (as produced by export_emoji).',
    parameters: {
      type: 'object',
      properties: {
        emojisJson: { type: 'string', description: 'JSON array string of emoji records, e.g. [{"name":"pepe","url":"https://..."}]' },
      },
      required: ['emojisJson'],
    },
    dangerous: false,
    examples: ['Import this emoji JSON export'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    let records: ImportEmojiRecord[];
    try {
      records = JSON.parse(String(params['emojisJson'] ?? '[]')) as ImportEmojiRecord[];
    } catch {
      return { success: false, message: 'emojisJson is not valid JSON' };
    }
    if (!Array.isArray(records) || records.length === 0) return { success: false, message: 'No emoji records to import' };

    await guild.emojis.fetch();
    const created: string[] = [];
    const skipped: string[] = [];

    for (const record of records.slice(0, 20)) {
      const name = String(record?.name ?? '').trim().replace(/[^a-zA-Z0-9_]/g, '');
      const url = String(record?.url ?? '').trim();
      if (!name || !url) { skipped.push('(invalid record)'); continue; }
      if (guild.emojis.cache.some(e => e.name?.toLowerCase() === name.toLowerCase())) { skipped.push(name); continue; }

      try {
        const emoji = await guild.emojis.create({ attachment: url, name, reason: 'Imported via AI Control Center' });
        created.push(emoji.name ?? name);
      } catch {
        skipped.push(name);
      }
    }

    return {
      success: created.length > 0,
      message: `Imported ${created.length} emoji(s)${created.length ? `: ${created.join(', ')}` : ''}${skipped.length ? `. Skipped: ${skipped.join(', ')}` : ''}`,
      data: { created, skipped },
    };
  }
}
