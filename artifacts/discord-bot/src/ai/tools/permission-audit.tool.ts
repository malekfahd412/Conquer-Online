import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionAuditTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_audit',
    description: 'Audits all roles and channels for dangerous permissions: Administrator, Manage Server, Manage Roles, Ban Members, Manage Webhooks, etc. Flags risky configurations.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
    examples: ['Run a permission audit', 'Which roles have dangerous permissions?', 'Check for overpowered roles'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dangerousFlags: [string, bigint][] = [
      ['Administrator', PermissionsBitField.Flags.Administrator],
      ['Manage Server', PermissionsBitField.Flags.ManageGuild],
      ['Manage Roles', PermissionsBitField.Flags.ManageRoles],
      ['Ban Members', PermissionsBitField.Flags.BanMembers],
      ['Kick Members', PermissionsBitField.Flags.KickMembers],
      ['Manage Webhooks', PermissionsBitField.Flags.ManageWebhooks],
      ['Manage Channels', PermissionsBitField.Flags.ManageChannels],
      ['Manage Messages', PermissionsBitField.Flags.ManageMessages],
      ['Mention Everyone', PermissionsBitField.Flags.MentionEveryone],
      ['Moderate Members', PermissionsBitField.Flags.ModerateMembers],
    ];

    const issues: string[] = [];
    const warnings: string[] = [];

    for (const role of guild.roles.cache.values()) {
      if (role.name === '@everyone') {
        // Check @everyone for dangerous perms
        for (const [perm, flag] of dangerousFlags) {
          if (role.permissions.has(flag)) {
            issues.push(`🚨 **@everyone** has **${perm}** — CRITICAL: all members inherit this`);
          }
        }
        continue;
      }

      const dangerFound: string[] = [];
      for (const [perm, flag] of dangerousFlags) {
        if (role.permissions.has(flag)) dangerFound.push(perm);
      }

      if (dangerFound.includes('Administrator')) {
        issues.push(`⚠️ **@${role.name}** (pos ${role.position}) has **Administrator** — bypasses all permission checks`);
      } else if (dangerFound.length >= 3) {
        warnings.push(`🔶 **@${role.name}** has ${dangerFound.length} sensitive perms: ${dangerFound.join(', ')}`);
      } else if (dangerFound.length > 0) {
        warnings.push(`🔷 **@${role.name}** has: ${dangerFound.join(', ')}`);
      }
    }

    // Check channels for @everyone overwrites that grant dangerous perms
    for (const ch of guild.channels.cache.values()) {
      if (!('permissionOverwrites' in ch)) continue;
      const chWithOW = ch as { permissionOverwrites: { cache: Map<string, { id: string; allow: Readonly<PermissionsBitField> }> }; name: string };
      const everyoneOW = chWithOW.permissionOverwrites.cache.get(guild.id);
      if (everyoneOW) {
        for (const [perm, flag] of dangerousFlags) {
          if (everyoneOW.allow.has(flag)) {
            issues.push(`⚠️ **#${chWithOW.name}** grants **${perm}** to @everyone via channel overwrite`);
          }
        }
      }
    }

    const allLines = [
      `**🔍 Permission Audit — ${guild.name}**`,
      `• Roles checked: ${guild.roles.cache.size}`,
      `• Channels checked: ${guild.channels.cache.size}`,
      ``,
      issues.length > 0 ? `**🚨 Critical Issues (${issues.length}):**\n${issues.join('\n')}` : '✅ No critical issues found',
      ``,
      warnings.length > 0 ? `**⚠️ Warnings (${warnings.length}):**\n${warnings.join('\n')}` : '✅ No warnings',
    ];

    return { success: true, message: allLines.filter(Boolean).join('\n') };
  }
}
