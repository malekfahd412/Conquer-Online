import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionResetTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_reset',
    description: 'Resets all permission overwrites on a channel (or all channels) to default — removing all role/member-specific overrides.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to reset overwrites on. Leave blank to reset ALL channels.' },
        role: { type: 'string', description: 'Only reset overwrites for this specific role (optional)' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Removes all channel permission overwrites — channels revert to role defaults.',
    examples: ['Reset all permissions on #general', 'Clear all channel permission overrides', 'Reset permissions for the Trial role in #announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const roleQuery = String(params['role'] ?? '').toLowerCase().trim();

    const targetChannels = chQuery
      ? guild.channels.cache.filter(c => c.id === chQuery || ('name' in c && (c.name as string).toLowerCase() === chQuery))
      : guild.channels.cache;

    if (targetChannels.size === 0) return { success: false, message: `Channel "${params['channel']}" not found` };

    const role = roleQuery ? guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery) : null;
    if (roleQuery && !role) return { success: false, message: `Role "${params['role']}" not found` };

    let success = 0; let failed = 0;

    for (const ch of targetChannels.values()) {
      const gc = ch as GuildChannel;
      if (!gc.permissionOverwrites) continue;
      try {
        if (role) {
          const ow = gc.permissionOverwrites.cache.get(role.id);
          if (ow) await ow.delete('Permission reset');
        } else {
          await gc.permissionOverwrites.set([], 'Permission reset — cleared all overwrites');
        }
        success++;
      } catch { failed++; }
    }

    const what = role ? `@${role.name} overrides` : 'all overwrites';
    return { success: true, message: `🔄 **Permission Reset:** Cleared ${what} on ${success} channel(s), ${failed} failed` };
  }
}
