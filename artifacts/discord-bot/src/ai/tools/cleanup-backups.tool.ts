import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { cleanupOldBackups, listBackups } from './backup-store';

export class CleanupBackupsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_backups',
    description: 'Removes old backups, keeping only the N most recent ones. Use to free up storage space.',
    parameters: {
      type: 'object',
      properties: {
        keep: { type: 'string', description: 'Number of recent backups to keep (default: 5)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed with deletion' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      const backups = await listBackups(guild.id);
      return {
        success: false,
        message: `Found ${backups.length} backup(s) for **${guild.name}**. Set \`confirm: "CONFIRM"\` to delete old ones (keeping most recent N).`,
      };
    }
    const keep = Math.max(1, parseInt(String(params['keep'] ?? '5')) || 5);
    const before = (await listBackups(guild.id)).length;
    const deleted = await cleanupOldBackups(guild.id, keep);
    return {
      success: true,
      message: `🗑️ Cleanup complete — deleted **${deleted}** old backup(s), kept ${Math.min(keep, before - deleted)} most recent.`,
    };
  }
}
