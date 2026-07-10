import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getBackup } from './backup-store';

export class VerifyBackupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'verify_backup',
    description: 'Verifies the integrity of a saved backup: checks required fields, counts resources, and cross-references against current server state.',
    parameters: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'Backup ID or label to verify' },
      },
      required: ['backup_id'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const backup = await getBackup(String(params['backup_id'] ?? ''));
    if (!backup) return { success: false, message: `Backup "${params['backup_id']}" not found` };

    const issues: string[] = [];
    const checks: string[] = [];

    // Check required fields
    if (!backup.data.channels) issues.push('Missing channels array');
    else checks.push(`✅ Channels: ${backup.data.channels.length}`);

    if (!backup.data.roles) issues.push('Missing roles array');
    else checks.push(`✅ Roles: ${backup.data.roles.length}`);

    if (!backup.data.emojis) issues.push('Missing emojis array');
    else checks.push(`✅ Emojis: ${backup.data.emojis.length}`);

    if (!backup.data.id) issues.push('Missing guild ID');
    else checks.push(`✅ Guild ID present: \`${backup.data.id}\``);

    if (!backup.data.name) issues.push('Missing guild name');
    else checks.push(`✅ Guild name: ${backup.data.name}`);

    // Cross-reference
    const currentChannelNames = new Set(guild.channels.cache.map(c => c.name));
    const backupChannelNames = backup.data.channels.map(c => c.name);
    const missingNow = backupChannelNames.filter(n => !currentChannelNames.has(n));
    if (missingNow.length > 0) checks.push(`⚠️ ${missingNow.length} backed-up channel(s) no longer exist in server: ${missingNow.slice(0, 5).join(', ')}`);
    else checks.push('✅ All backed-up channels still exist in server');

    const guildMatch = backup.data.id === guild.id;
    if (!guildMatch) checks.push(`⚠️ Backup is from guild ID \`${backup.data.id}\` — different from current guild \`${guild.id}\``);
    else checks.push('✅ Guild ID matches current server');

    const status = issues.length === 0 ? '✅ Valid' : `❌ Invalid (${issues.length} issue(s))`;

    const lines = [
      `🔍 **Backup Verification** — \`${backup.label}\``,
      `Status: **${status}**`,
      `Type: ${backup.type} | Created: ${new Date(backup.createdAt).toLocaleDateString()}`,
      '',
      ...checks,
    ];
    if (issues.length > 0) { lines.push('', '**Issues:**'); issues.forEach(i => lines.push(`❌ ${i}`)); }

    return { success: true, message: lines.join('\n') };
  }
}
