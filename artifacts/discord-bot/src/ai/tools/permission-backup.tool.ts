import { promises as fs } from 'fs';
import path from 'path';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionBackupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_backup',
    description: 'Creates a full backup of all role and channel permission overwrites. Saved to data/ and restorable via permission_restore.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label for this backup (e.g. "before-restructure", default: timestamp)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Backup all permissions before making changes', 'Create permission snapshot labeled "pre-event"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const label = String(params['label'] ?? `backup-${Date.now()}`).replace(/[^a-z0-9_-]/gi, '-');

    const roles = guild.roles.cache.map(r => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions.toArray(),
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      position: r.position,
    }));

    const channels = guild.channels.cache.map(ch => {
      const gc = ch as GuildChannel;
      return {
        id: gc.id,
        name: gc.name,
        type: gc.type,
        overwrites: gc.permissionOverwrites
          ? Array.from(gc.permissionOverwrites.cache.values()).map(o => ({
              id: o.id,
              type: o.type,
              allow: o.allow.toArray(),
              deny: o.deny.toArray(),
            }))
          : [],
      };
    });

    const backup = {
      guildId: guild.id,
      guildName: guild.name,
      label,
      createdAt: new Date().toISOString(),
      roles,
      channels,
    };

    const filename = `perm-backup-${label}.json`;
    const filepath = path.join(process.cwd(), 'data', 'permission-backups', filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(backup, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ **Permission backup created:** \`${label}\`\n• Roles: ${roles.length}\n• Channels: ${channels.length}\n• File: \`data/permission-backups/${filename}\``,
    };
  }
}
