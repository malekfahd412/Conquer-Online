import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listBackups } from './backup-store';

export class ListSnapshotsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_snapshots',
    description: 'Lists all saved server backups and snapshots with their IDs, labels, dates, sizes, and types.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by type: full, snapshot, incremental, all (default: all)', enum: ['full', 'snapshot', 'incremental', 'all'] },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const typeFilter = String(params['type'] ?? 'all').toLowerCase();
    let backups = await listBackups(guild.id);
    if (typeFilter !== 'all') backups = backups.filter(b => b.type === typeFilter);

    if (backups.length === 0) {
      return { success: true, message: `No ${typeFilter !== 'all' ? typeFilter + ' ' : ''}backups found. Use \`backup_server\` or \`create_snapshot\` to create one.` };
    }

    const lines = [
      `💾 **Server Backups & Snapshots** — **${guild.name}** (${backups.length} total)\n`,
    ];
    for (const b of backups) {
      const date = new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const size = b.size ? `~${Math.round(b.size / 1024)}KB` : '?';
      const typeEmoji = b.type === 'full' ? '📦' : b.type === 'snapshot' ? '📸' : '🔄';
      lines.push(`${typeEmoji} **${b.label}** \`[${b.id}]\``);
      lines.push(`   Type: ${b.type} | Date: ${date} | Size: ${size}${b.description ? ` | ${b.description}` : ''}`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
