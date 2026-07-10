import { promises as fs } from 'fs';
import path from 'path';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionExportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_export',
    description: 'Exports a detailed human-readable report of all server permissions — roles and channel overwrites — to a JSON file.',
    parameters: {
      type: 'object',
      properties: {
        include_channels: { type: 'string', description: 'Include channel permission overwrites (true/false, default true)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Export all server permissions', 'Export permission report without channel details'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const includeChannels = String(params['include_channels'] ?? 'true') !== 'false';

    const roles = guild.roles.cache
      .sort((a, b) => b.position - a.position)
      .map(r => ({
        name: r.name,
        id: r.id,
        color: r.hexColor,
        position: r.position,
        hoist: r.hoist,
        mentionable: r.mentionable,
        managed: r.managed,
        permissions: r.permissions.toArray(),
        memberCount: r.members.size,
      }));

    const channels = includeChannels
      ? guild.channels.cache.map(ch => {
          const gc = ch as GuildChannel;
          return {
            name: gc.name,
            id: gc.id,
            type: gc.type,
            overwrites: gc.permissionOverwrites
              ? Array.from(gc.permissionOverwrites.cache.values()).map(o => ({
                  targetId: o.id,
                  type: o.type === 0 ? 'role' : 'member',
                  allow: o.allow.toArray(),
                  deny: o.deny.toArray(),
                }))
              : [],
          };
        })
      : [];

    const report = {
      exportedAt: new Date().toISOString(),
      guild: { id: guild.id, name: guild.name },
      totalRoles: roles.length,
      totalChannels: guild.channels.cache.size,
      roles,
      channels,
    };

    const filename = `perm-export-${guild.id}-${Date.now()}.json`;
    const filepath = path.join(process.cwd(), 'data', filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ **Permission export saved:** \`data/${filename}\`\n• Roles: ${roles.length}\n• Channels: ${guild.channels.cache.size}${includeChannels ? ' (with overwrites)' : ' (no overwrite details)'}`,
    };
  }
}
