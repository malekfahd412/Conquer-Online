import { promises as fs } from 'fs';
import path from 'path';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface BackupRole {
  id: string;
  name: string;
  permissions: string[];
}

interface Backup {
  label: string;
  roles: BackupRole[];
}

export class PermissionDiffTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_diff',
    description: 'Compares current server permissions against a saved backup to show what has changed since the backup was taken.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Backup label to compare against (from permission_backup)' },
      },
      required: ['label'],
    },
    dangerous: false,
    examples: ['Show permission changes since backup "pre-event"', 'Diff current permissions vs pre-restructure backup'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const label = String(params['label'] ?? '').trim();
    if (!label) return { success: false, message: 'Backup label is required' };

    const filepath = path.join(process.cwd(), 'data', 'permission-backups', `perm-backup-${label}.json`);
    let backup: Backup;
    try {
      const raw = await fs.readFile(filepath, 'utf-8');
      backup = JSON.parse(raw) as Backup;
    } catch {
      return { success: false, message: `Backup "${label}" not found. Use permission_backup to create one.` };
    }

    const changes: string[] = [];

    for (const backupRole of backup.roles) {
      const currentRole = guild.roles.cache.find(r => r.id === backupRole.id || r.name === backupRole.name);
      if (!currentRole) {
        changes.push(`❌ **@${backupRole.name}** — role was deleted`);
        continue;
      }

      const backupPerms = new Set(backupRole.permissions);
      const currentPerms = new Set(currentRole.permissions.toArray() as string[]);

      const gained = [...currentPerms].filter(p => !backupPerms.has(p));
      const lost = [...backupPerms].filter(p => !currentPerms.has(p));

      if (gained.length > 0 || lost.length > 0) {
        changes.push(`**@${currentRole.name}:**`);
        if (gained.length > 0) changes.push(`  🟢 Gained: ${gained.join(', ')}`);
        if (lost.length > 0) changes.push(`  🔴 Lost: ${lost.join(', ')}`);
      }
    }

    // Check for new roles not in backup
    for (const role of guild.roles.cache.values()) {
      if (!backup.roles.some(r => r.id === role.id || r.name === role.name)) {
        const perms = (role.permissions.toArray() as string[]).slice(0, 5);
        changes.push(`🆕 **@${role.name}** — new role (${perms.join(', ')}${role.permissions.toArray().length > 5 ? '...' : ''})`);
      }
    }

    if (changes.length === 0) {
      return { success: true, message: `✅ No permission changes detected since backup **"${label}"**` };
    }

    return {
      success: true,
      message: `**🔄 Permission Diff vs "${label}":**\n\n${changes.join('\n')}`,
    };
  }
}
