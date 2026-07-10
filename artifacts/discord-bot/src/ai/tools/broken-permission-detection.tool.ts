import { ChannelType, PermissionsBitField } from 'discord.js';
import type { Guild, TextChannel, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BrokenPermissionDetectionTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'broken_permission_detection',
    description: 'Scans all channels and roles for broken or conflicting permission configurations: channels inaccessible to @everyone, roles granting admin but not admin-protected, and permission conflicts.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const issues: string[] = [];
    const lines = [`🔐 **Broken Permission Detection** — **${guild.name}**\n`];

    // Check channels inaccessible to @everyone
    const everyone = guild.roles.everyone;
    const inaccessibleChannels: string[] = [];
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
      const gCh = ch as GuildChannel;
      try {
        const perms = gCh.permissionsFor(everyone);
        if (perms && !perms.has(PermissionsBitField.Flags.ViewChannel)) {
          inaccessibleChannels.push(ch.name);
        }
      } catch { /* skip */ }
    }
    if (inaccessibleChannels.length > 0) {
      issues.push(`**${inaccessibleChannels.length} channel(s) not visible to @everyone** (may be intentional for private channels):\n${inaccessibleChannels.slice(0, 10).map(n => `  • #${n}`).join('\n')}`);
    }

    // Check roles with dangerous permissions but not admin
    const dangerousNonAdmin = guild.roles.cache.filter(r => {
      if (r.id === guild.id || r.managed) return false;
      const p = r.permissions;
      return (p.has(PermissionsBitField.Flags.ManageRoles) || p.has(PermissionsBitField.Flags.ManageChannels)) &&
             !p.has(PermissionsBitField.Flags.Administrator);
    });
    if (dangerousNonAdmin.size > 3) {
      issues.push(`**${dangerousNonAdmin.size} roles** have Manage Roles/Channels without full Administrator: ${[...dangerousNonAdmin.values()].map(r => `\`${r.name}\``).slice(0, 5).join(', ')}`);
    }

    // Check for roles higher than bots in hierarchy (can be an issue)
    const botMember = guild.members.me;
    if (botMember) {
      const higherRoles = guild.roles.cache.filter(r =>
        r.position > botMember.roles.highest.position && !r.managed && r.id !== guild.id
      );
      if (higherRoles.size > 0) {
        issues.push(`**${higherRoles.size} role(s)** are higher than the bot's highest role — bot cannot manage these: ${[...higherRoles.values()].slice(0, 3).map(r => `\`${r.name}\``).join(', ')}`);
      }
    }

    // Check for channels with contradictory overwrites
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildText) continue;
      const textCh = ch as TextChannel;
      const overwrites = textCh.permissionOverwrites.cache;
      for (const [, ow] of overwrites) {
        const allow = new PermissionsBitField(ow.allow);
        const deny = new PermissionsBitField(ow.deny);
        // Check if same permission is both allowed and denied
        const conflict = allow.toArray().filter(p => deny.has(PermissionsBitField.resolve(p)));
        if (conflict.length > 0) {
          issues.push(`**#${ch.name}**: Contradictory overwrite — same permission both allowed and denied: ${conflict.join(', ')}`);
        }
      }
    }

    if (issues.length === 0) {
      lines.push('✅ No broken permission configurations detected!');
    } else {
      lines.push(`Found **${issues.length}** permission issue(s):\n`);
      for (const issue of issues) lines.push(`⚠️ ${issue}\n`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
