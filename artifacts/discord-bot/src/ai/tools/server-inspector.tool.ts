import { ChannelType, PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ServerInspectorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'server_inspector',
    description: 'Deep structural inspection of the server: channel hierarchy, role hierarchy, permission matrix summary, resource utilization, and anomaly detection.',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Section to inspect: structure, roles, permissions, resources, anomalies, all (default: all)',
          enum: ['structure', 'roles', 'permissions', 'resources', 'anomalies', 'all'],
        },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const section = String(params['section'] ?? 'all').toLowerCase();
    const lines: string[] = [`🔍 **Server Inspector** — **${guild.name}**\n`];

    if (section === 'all' || section === 'structure') {
      lines.push('**📐 Channel Structure:**');
      const cats = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.rawPosition - b.rawPosition);
      const uncategorized = guild.channels.cache.filter(c =>
        c.type !== ChannelType.GuildCategory && !('parentId' in c && (c as { parentId?: string }).parentId)
      );
      for (const [, cat] of cats) {
        const children = guild.channels.cache.filter(c => 'parentId' in c && (c as { parentId?: string }).parentId === cat.id);
        lines.push(`  📁 **${cat.name}** (${children.size} channels)`);
      }
      if (uncategorized.size > 0) lines.push(`  📁 _Uncategorized_ (${uncategorized.size} channels)`);
      lines.push('');
    }

    if (section === 'all' || section === 'roles') {
      lines.push('**🎭 Role Hierarchy (top 15):**');
      const sorted = guild.roles.cache.sort((a, b) => b.position - a.position).first(15);
      for (const role of sorted) {
        const memberCount = guild.members.cache.filter(m => m.roles.cache.has(role.id)).size;
        const isAdmin = role.permissions.has(PermissionsBitField.Flags.Administrator);
        lines.push(`  ${isAdmin ? '🔴' : '🔵'} **${role.name}** — ${memberCount} member(s) | pos: ${role.position}`);
      }
      lines.push('');
    }

    if (section === 'all' || section === 'permissions') {
      lines.push('**🔐 @everyone Permission Flags:**');
      const perms = guild.roles.everyone.permissions;
      const key: Array<[string, bigint]> = [
        ['Send Messages', PermissionsBitField.Flags.SendMessages],
        ['Read Messages', PermissionsBitField.Flags.ViewChannel],
        ['Manage Messages', PermissionsBitField.Flags.ManageMessages],
        ['Manage Channels', PermissionsBitField.Flags.ManageChannels],
        ['Manage Roles', PermissionsBitField.Flags.ManageRoles],
        ['Kick Members', PermissionsBitField.Flags.KickMembers],
        ['Ban Members', PermissionsBitField.Flags.BanMembers],
        ['Administrator', PermissionsBitField.Flags.Administrator],
        ['Mention @everyone', PermissionsBitField.Flags.MentionEveryone],
      ];
      for (const [name, flag] of key) {
        lines.push(`  ${perms.has(flag) ? '✅' : '❌'} ${name}`);
      }
      lines.push('');
    }

    if (section === 'all' || section === 'resources') {
      const emojiLimit = guild.premiumTier === 3 ? 500 : guild.premiumTier === 2 ? 300 : guild.premiumTier === 1 ? 100 : 50;
      const stickerLimit = guild.premiumTier === 3 ? 60 : guild.premiumTier === 2 ? 30 : guild.premiumTier === 1 ? 15 : 5;
      lines.push('**📦 Resource Utilization:**');
      lines.push(`  Emojis: ${guild.emojis.cache.size}/${emojiLimit}`);
      lines.push(`  Stickers: ${guild.stickers.cache.size}/${stickerLimit}`);
      lines.push(`  Channels: ${guild.channels.cache.size}/500`);
      lines.push(`  Roles: ${guild.roles.cache.size}/250`);
      lines.push('');
    }

    if (section === 'all' || section === 'anomalies') {
      lines.push('**⚠️ Anomaly Detection:**');
      const anomalies: string[] = [];
      // Roles with no members
      const emptyRoles = guild.roles.cache.filter(r =>
        !r.managed && r.id !== guild.id && guild.members.cache.filter(m => m.roles.cache.has(r.id)).size === 0
      ).size;
      if (emptyRoles > 0) anomalies.push(`${emptyRoles} role(s) with 0 members assigned`);
      // Channels with no overwrites
      const noPermCh = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionOverwrites.cache.size === 0).size;
      if (noPermCh > 5) anomalies.push(`${noPermCh} channels with no permission overwrites (inherit @everyone)`);
      // Duplicate channel names
      const chNames = guild.channels.cache.map(c => c.name.toLowerCase());
      const dupes = chNames.filter((n, i) => chNames.indexOf(n) !== i);
      if (dupes.length > 0) anomalies.push(`Duplicate channel names: ${[...new Set(dupes)].map(n => `"${n}"`).join(', ')}`);

      if (anomalies.length === 0) lines.push('  ✅ No anomalies detected');
      else anomalies.forEach(a => lines.push(`  ⚠️ ${a}`));
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
