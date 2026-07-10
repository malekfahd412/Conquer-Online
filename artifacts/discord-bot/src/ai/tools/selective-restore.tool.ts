import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getBackup } from './backup-store';

export class SelectiveRestoreTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'selective_restore',
    description: 'Restores specific named channels or roles from a backup, rather than the full server.',
    parameters: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'Backup ID or label' },
        channels: { type: 'string', description: 'Comma-separated channel names to restore (e.g. "general,announcements")' },
        roles: { type: 'string', description: 'Comma-separated role names to restore (e.g. "Moderator,VIP")' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['backup_id', 'confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Selective restore requires `confirm: "CONFIRM"`' };
    }
    const backup = await getBackup(String(params['backup_id'] ?? ''));
    if (!backup) return { success: false, message: `Backup "${params['backup_id']}" not found` };

    const channelNames = String(params['channels'] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const roleNames = String(params['roles'] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    const created = { channels: 0, roles: 0 };
    const failed: string[] = [];

    for (const name of channelNames) {
      const chData = backup.data.channels.find(c => c.name.toLowerCase() === name);
      if (!chData) { failed.push(`channel "${name}" not in backup`); continue; }
      const existing = guild.channels.cache.find(c => c.name.toLowerCase() === name);
      if (existing) { failed.push(`channel "${name}" already exists`); continue; }
      try {
        await guild.channels.create({ name: chData.name, type: chData.type as never, reason: `Selective restore from ${backup.id}` });
        created.channels++;
      } catch { failed.push(`failed to create channel "${name}"`); }
    }

    for (const name of roleNames) {
      const roleData = backup.data.roles.find(r => r.name.toLowerCase() === name);
      if (!roleData) { failed.push(`role "${name}" not in backup`); continue; }
      const existing = guild.roles.cache.find(r => r.name.toLowerCase() === name);
      if (existing) { failed.push(`role "${name}" already exists`); continue; }
      try {
        await guild.roles.create({ name: roleData.name, color: roleData.color, hoist: roleData.hoist, mentionable: roleData.mentionable, permissions: new PermissionsBitField(BigInt(roleData.permissions)), reason: `Selective restore from ${backup.id}` });
        created.roles++;
      } catch { failed.push(`failed to create role "${name}"`); }
    }

    const lines = [
      `✅ **Selective Restore** from \`${backup.label}\``,
      `Created: ${created.channels} channel(s), ${created.roles} role(s)`,
    ];
    if (failed.length) lines.push(`\n⚠️ Issues:\n${failed.map(f => `• ${f}`).join('\n')}`);

    return { success: true, message: lines.join('\n') };
  }
}
