import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { saveBackup, type GuildBackup } from './backup-store';
import { promises as fs } from 'fs';
import path from 'path';

export class ImportBackupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_backup',
    description: 'Imports a backup from a JSON file in the data directory into the backup store, making it available for restore operations.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'JSON filename in the data/ directory (without path, e.g. "my_export.json")' },
        label: { type: 'string', description: 'Label to assign to the imported backup (default: filename)' },
      },
      required: ['filename'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? '').replace(/\.\./g, '');
    const filePath = path.join(process.cwd(), 'data', filename);

    let raw: string;
    try { raw = await fs.readFile(filePath, 'utf-8'); } catch {
      return { success: false, message: `File \`data/${filename}\` not found. Place the backup JSON file in the data/ directory.` };
    }

    let parsed: { data?: GuildBackup; label?: string; type?: string };
    try { parsed = JSON.parse(raw); } catch {
      return { success: false, message: `File \`data/${filename}\` is not valid JSON` };
    }

    if (!parsed.data?.channels || !parsed.data?.roles) {
      return { success: false, message: 'Invalid backup format — missing required fields (data.channels, data.roles)' };
    }

    const label = String(params['label'] ?? parsed.label ?? filename.replace('.json', '')).replace(/\W+/g, '_').slice(0, 80);
    const backup = await saveBackup({
      label, type: (parsed.type as 'full' | 'snapshot' | 'incremental') ?? 'full',
      guildId: guild.id, guildName: guild.name,
      data: parsed.data,
      description: `Imported from ${filename}`,
    });

    return {
      success: true,
      message: `✅ Backup imported as \`${label}\` (ID: ${backup.id})\n` +
        `Channels: ${parsed.data.channels.length} | Roles: ${parsed.data.roles.length} | Emojis: ${parsed.data.emojis.length}\n` +
        `Use \`restore_server\` to apply it.`,
      data: { id: backup.id, label },
    };
  }
}
