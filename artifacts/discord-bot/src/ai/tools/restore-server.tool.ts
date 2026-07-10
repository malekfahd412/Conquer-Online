import { ChannelType, PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getBackup } from './backup-store';

export class RestoreServerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'restore_server',
    description: 'Restores server roles and channels from a saved backup. DESTRUCTIVE — existing roles/channels with the same name will not be duplicated; missing ones will be created. Requires explicit confirmation.',
    parameters: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'Backup ID or label to restore from' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed with the restore' },
        restore_roles: { type: 'string', description: 'Set to "false" to skip role restoration (default: true)' },
        restore_channels: { type: 'string', description: 'Set to "false" to skip channel restoration (default: true)' },
      },
      required: ['backup_id', 'confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Restore requires `confirm: "CONFIRM"`. This will create missing channels and roles from the backup.' };
    }

    const backup = await getBackup(String(params['backup_id'] ?? ''));
    if (!backup) return { success: false, message: `Backup "${params['backup_id']}" not found. Use \`list_snapshots\` to see available backups.` };

    const restoreRoles = String(params['restore_roles'] ?? 'true').toLowerCase() !== 'false';
    const restoreChannels = String(params['restore_channels'] ?? 'true').toLowerCase() !== 'false';

    const created = { roles: 0, categories: 0, channels: 0 };
    const skipped = { roles: 0, channels: 0 };

    if (restoreRoles) {
      for (const roleData of backup.data.roles) {
        if (roleData.name === '@everyone') continue;
        const existing = guild.roles.cache.find(r => r.name === roleData.name);
        if (existing) { skipped.roles++; continue; }
        try {
          await guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            hoist: roleData.hoist,
            mentionable: roleData.mentionable,
            permissions: new PermissionsBitField(BigInt(roleData.permissions)),
            reason: `Restore from backup ${backup.id}`,
          });
          created.roles++;
        } catch { skipped.roles++; }
      }
    }

    if (restoreChannels) {
      // Restore categories first
      for (const catData of backup.data.categories) {
        const existing = guild.channels.cache.find(c => c.name === catData.name && c.type === ChannelType.GuildCategory);
        if (existing) { skipped.channels++; continue; }
        try {
          await guild.channels.create({ name: catData.name, type: ChannelType.GuildCategory, reason: `Restore from backup ${backup.id}` });
          created.categories++;
        } catch { skipped.channels++; }
      }
      // Refresh cache
      await guild.channels.fetch();
      // Restore channels
      for (const chData of backup.data.channels) {
        const existing = guild.channels.cache.find(c => c.name === chData.name && c.type === chData.type);
        if (existing) { skipped.channels++; continue; }
        try {
          const parentName = backup.data.categories.find(c => c.id === chData.parentId)?.name;
          const parentId = parentName ? guild.channels.cache.find(c => c.name === parentName && c.type === ChannelType.GuildCategory)?.id : undefined;
          await guild.channels.create({
            name: chData.name, type: chData.type as never,
            parent: parentId,
            topic: chData.topic ?? undefined,
            nsfw: chData.nsfw,
            rateLimitPerUser: chData.rateLimitPerUser,
            reason: `Restore from backup ${backup.id}`,
          });
          created.channels++;
        } catch { skipped.channels++; }
      }
    }

    return {
      success: true,
      message: `✅ **Restore complete** from backup \`${backup.label}\`\n` +
        `Created: ${created.roles} role(s), ${created.categories} categor(ies), ${created.channels} channel(s)\n` +
        `Skipped (already exist): ${skipped.roles} roles, ${skipped.channels} channels\n` +
        `⚠️ Permission overwrites and channel topics may need manual review.`,
    };
  }
}
