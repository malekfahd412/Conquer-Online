import { PermissionsBitField } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionRepairTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_repair',
    description: 'Automatically fixes common permission misconfigurations: removes dangerous perms from @everyone, fixes channel overwrites granting admin-level perms to @everyone.',
    parameters: {
      type: 'object',
      properties: {
        dry_run: { type: 'string', description: 'If "true", only reports what would be fixed without making changes (default: false)' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Modifies role permissions automatically based on best-practice analysis.',
    examples: ['Run permission repair in dry-run mode', 'Fix permission misconfigurations'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dryRun = String(params['dry_run'] ?? 'false') === 'true';
    const fixes: string[] = [];
    const skipped: string[] = [];

    const dangerousFlags = [
      PermissionsBitField.Flags.Administrator,
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.ManageWebhooks,
      PermissionsBitField.Flags.MentionEveryone,
      PermissionsBitField.Flags.ModerateMembers,
    ];

    const flagName = (f: bigint) =>
      Object.entries(PermissionsBitField.Flags).find(([, v]) => v === f)?.[0] ?? 'Unknown';

    // Fix @everyone dangerous perms
    const everyone = guild.roles.everyone;
    const everyoneDangerous = dangerousFlags.filter(f => everyone.permissions.has(f));
    if (everyoneDangerous.length > 0) {
      const names = everyoneDangerous.map(flagName);
      fixes.push(`Remove from @everyone: ${names.join(', ')}`);
      if (!dryRun) {
        try {
          const safe = everyone.permissions.remove(everyoneDangerous);
          await everyone.setPermissions(safe, 'Permission repair: remove dangerous @everyone perms');
        } catch { skipped.push('@everyone (insufficient permissions)'); }
      }
    }

    // Check channels for @everyone overwrites granting dangerous perms
    for (const ch of guild.channels.cache.values()) {
      const gc = ch as GuildChannel;
      if (!gc.permissionOverwrites) continue;
      const evOW = gc.permissionOverwrites.cache.get(guild.id);
      if (!evOW) continue;
      const badGranted = dangerousFlags.filter(f => evOW.allow.has(f));
      if (badGranted.length > 0) {
        const names = badGranted.map(flagName);
        const chName = gc.name;
        fixes.push(`Remove dangerous @everyone overwrite in #${chName}: ${names.join(', ')}`);
        if (!dryRun) {
          try { await evOW.delete('Permission repair: remove dangerous channel overwrite'); } catch { skipped.push(`#${chName} overwrite`); }
        }
      }
    }

    if (fixes.length === 0) {
      return { success: true, message: '✅ No permission issues found — server permissions look healthy!' };
    }

    const prefix = dryRun ? '🔍 **[DRY RUN]** Would fix:' : '🔧 **Repaired:**';
    const suffix = dryRun ? '\nRun without dry_run=true to apply fixes.' : skipped.length > 0 ? `\n⚠️ Skipped (insufficient hierarchy): ${skipped.join(', ')}` : '';

    return {
      success: true,
      message: `${prefix}\n${fixes.map(f => `• ${f}`).join('\n')}${suffix}`,
    };
  }
}
