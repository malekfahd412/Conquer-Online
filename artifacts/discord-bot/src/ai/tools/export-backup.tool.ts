import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listBackupsFull } from './backup-store';
import { promises as fs } from 'fs';
import path from 'path';

export class ExportBackupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_backup',
    description: 'Exports a backup to a standalone JSON file in the data directory for external storage or transfer.',
    parameters: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'Backup ID or label to export' },
        output_name: { type: 'string', description: 'Output filename without extension (default: backup label)' },
      },
      required: ['backup_id'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const backups = await listBackupsFull(guild.id);
    const idOrLabel = String(params['backup_id'] ?? '');
    const backup = backups.find(b => b.id === idOrLabel || b.label.toLowerCase() === idOrLabel.toLowerCase());
    if (!backup) return { success: false, message: `Backup "${params['backup_id']}" not found. Use \`list_snapshots\` to see available backups.` };

    const outputName = String(params['output_name'] ?? backup.label).replace(/\W+/g, '_');
    const filePath = path.join(process.cwd(), 'data', `${outputName}_export.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf-8');

    const stats = await fs.stat(filePath);
    return {
      success: true,
      message: `✅ Backup exported to \`data/${outputName}_export.json\`\n` +
        `Size: ${Math.round(stats.size / 1024)}KB | Type: ${backup.type} | Created: ${new Date(backup.createdAt).toLocaleDateString()}`,
      data: { filePath, size: stats.size },
    };
  }
}
