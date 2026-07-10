import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listBackupsFull } from './backup-store';

export class InspectBackupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'inspect_backup',
    description: 'Shows detailed contents of a saved backup: full lists of channels, roles, categories, and emojis stored in it.',
    parameters: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'Backup ID or label to inspect' },
        section: { type: 'string', description: 'Section to show: channels, roles, emojis, all (default: all)', enum: ['channels', 'roles', 'emojis', 'all'] },
      },
      required: ['backup_id'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const backups = await listBackupsFull(guild.id);
    const id = String(params['backup_id'] ?? '');
    const backup = backups.find(b => b.id === id || b.label.toLowerCase() === id.toLowerCase());
    if (!backup) return { success: false, message: `Backup "${params['backup_id']}" not found. Use \`list_snapshots\` to see available backups.` };

    const section = String(params['section'] ?? 'all').toLowerCase();
    const lines = [
      `📦 **Backup Inspector** — \`${backup.label}\``,
      `Type: ${backup.type} | Guild: ${backup.data.name} | Created: ${new Date(backup.createdAt).toLocaleDateString()}`,
      '',
    ];

    if (section === 'all' || section === 'channels') {
      lines.push(`**📺 Channels (${backup.data.channels.length}):**`);
      for (const ch of backup.data.channels.slice(0, 20)) lines.push(`  • ${ch.name} (type ${ch.type})`);
      if (backup.data.channels.length > 20) lines.push(`  _...and ${backup.data.channels.length - 20} more_`);
      lines.push('');
    }

    if (section === 'all' || section === 'roles') {
      lines.push(`**🎭 Roles (${backup.data.roles.length}):**`);
      for (const r of backup.data.roles.slice(0, 20)) {
        const color = r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'none';
        lines.push(`  • **${r.name}** | color: ${color} | pos: ${r.position}`);
      }
      if (backup.data.roles.length > 20) lines.push(`  _...and ${backup.data.roles.length - 20} more_`);
      lines.push('');
    }

    if (section === 'all' || section === 'emojis') {
      lines.push(`**😀 Emojis (${backup.data.emojis.length}):**`);
      const emojiNames = backup.data.emojis.slice(0, 30).map(e => `:${e.name}:`).join(' ');
      lines.push(`  ${emojiNames || '_None_'}`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
