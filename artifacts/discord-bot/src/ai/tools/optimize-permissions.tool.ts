import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class OptimizePermissionsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'optimize_permissions',
    description: 'Analyzes the server\'s permission structure and suggests simplifications: redundant overwrites, channels that inherit @everyone correctly, roles with overlapping permissions.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const suggestions: string[] = [];
    let totalOverwrites = 0;
    let redundantCount = 0;

    // Channels with very high overwrite counts
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
      const owCount = ch.permissionOverwrites.cache.size;
      totalOverwrites += owCount;
      if (owCount > 10) suggestions.push(`📺 **#${ch.name}** has ${owCount} permission overwrites — review for redundancies`);

      // Check for overwrites matching @everyone (redundant)
      const everyonePerm = guild.roles.everyone.permissions;
      for (const [id, ow] of ch.permissionOverwrites.cache) {
        if (id === guild.id) continue;
        if (ow.allow.bitfield === 0n && ow.deny.bitfield === 0n) {
          redundantCount++;
        }
        if (ow.allow.equals(everyonePerm) && ow.deny.bitfield === 0n) {
          redundantCount++;
        }
      }
    }
    if (redundantCount > 0) suggestions.push(`🧹 Found **${redundantCount}** empty/redundant permission overwrites — they can be safely removed`);

    // Roles with identical permissions
    const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.id !== guild.id);
    const permGroups: Record<string, string[]> = {};
    for (const r of roles) {
      const key = r.permissions.bitfield.toString();
      permGroups[key] = [...(permGroups[key] ?? []), r.name];
    }
    for (const [, group] of Object.entries(permGroups)) {
      if (group.length > 1) suggestions.push(`🔄 Roles **${group.join(', ')}** have identical permissions — consider merging`);
    }

    // @everyone over-privileged
    const everyonePerms = guild.roles.everyone.permissions;
    const dangerous = ['ManageMessages', 'ManageChannels', 'MentionEveryone'] as const;
    for (const p of dangerous) {
      if (everyonePerms.has(p)) suggestions.push(`⚠️ @everyone has **${p}** — this is a security risk`);
    }

    const lines = [
      `🔐 **Permission Optimization Report** — **${guild.name}**`,
      `Total overwrites across channels: ${totalOverwrites}`,
      '',
      suggestions.length > 0 ? `**${suggestions.length} Suggestion(s):**\n${suggestions.slice(0, 10).join('\n')}` : '✅ Permission structure looks well-optimized!',
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
