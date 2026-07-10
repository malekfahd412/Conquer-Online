import { promises as fs } from 'fs';
import path from 'path';
import { PermissionsBitField } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface PermBackup {
  guildId: string;
  label: string;
  roles: Array<{ id: string; name: string; permissions: string[] }>;
  channels: Array<{ id: string; overwrites: Array<{ id: string; type: number; allow: string[]; deny: string[] }> }>;
}

export class PermissionRestoreTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_restore',
    description: 'Restores role permissions from a backup created by permission_backup. Provide the backup label to restore.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Backup label to restore (from permission_backup). Leave blank to list available backups.' },
        roles_only: { type: 'string', description: 'Restore only role permissions, skip channel overwrites (true/false, default false)' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Overwrites current role and channel permissions with backup values.',
    examples: ['Restore permissions from backup "pre-event"', 'List available permission backups'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const backupDir = path.join(process.cwd(), 'data', 'permission-backups');
    const label = String(params['label'] ?? '').trim();
    const rolesOnly = String(params['roles_only'] ?? 'false') === 'true';

    if (!label) {
      try {
        const files = await fs.readdir(backupDir);
        const backups = files.filter(f => f.endsWith('.json')).map(f => f.replace('perm-backup-', '').replace('.json', ''));
        if (backups.length === 0) return { success: true, message: 'No permission backups found. Use `permission_backup` to create one.' };
        return { success: true, message: `**📦 Available Permission Backups:**\n${backups.map(b => `• ${b}`).join('\n')}` };
      } catch {
        return { success: true, message: 'No permission backups directory found. Use `permission_backup` to create one.' };
      }
    }

    const filepath = path.join(backupDir, `perm-backup-${label}.json`);
    let backup: PermBackup;
    try {
      const raw = await fs.readFile(filepath, 'utf-8');
      backup = JSON.parse(raw) as PermBackup;
    } catch {
      return { success: false, message: `Backup "${label}" not found. Use permission_restore without a label to list available backups.` };
    }

    if (backup.guildId !== guild.id) {
      return { success: false, message: 'This backup was created for a different server and cannot be restored here.' };
    }

    let rolesRestored = 0; let channelsRestored = 0;

    for (const rb of backup.roles) {
      const role = guild.roles.cache.get(rb.id);
      if (!role || role.managed) continue;
      try {
        const flags = rb.permissions.filter(p => p in PermissionsBitField.Flags) as (keyof typeof PermissionsBitField.Flags)[];
        await role.setPermissions(new PermissionsBitField(flags.map(f => PermissionsBitField.Flags[f])));
        rolesRestored++;
      } catch { /* skip */ }
    }

    if (!rolesOnly) {
      for (const cb of backup.channels) {
        const ch = guild.channels.cache.get(cb.id);
        if (!ch) continue;
        const gc = ch as GuildChannel;
        if (!gc.permissionOverwrites) continue;
        try {
          await gc.permissionOverwrites.set(
            cb.overwrites.map(o => {
              const allowFlags = o.allow.filter(p => p in PermissionsBitField.Flags) as (keyof typeof PermissionsBitField.Flags)[];
              const denyFlags = o.deny.filter(p => p in PermissionsBitField.Flags) as (keyof typeof PermissionsBitField.Flags)[];
              return {
                id: o.id,
                type: o.type,
                allow: new PermissionsBitField(allowFlags.map(f => PermissionsBitField.Flags[f])),
                deny: new PermissionsBitField(denyFlags.map(f => PermissionsBitField.Flags[f])),
              };
            }),
            `Permission restore from backup: ${label}`,
          );
          channelsRestored++;
        } catch { /* skip */ }
      }
    }

    return {
      success: true,
      message: `✅ **Permission restore complete from "${label}":**\n• Roles restored: ${rolesRestored}\n• Channels restored: ${rolesOnly ? 'skipped' : channelsRestored}`,
    };
  }
}
