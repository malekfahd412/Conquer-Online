import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { saveBackup, type GuildBackup } from './backup-store';

export class CreateSnapshotTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_snapshot',
    description: 'Creates a lightweight snapshot of the current server state (channel names, role names, member count). Faster than a full backup — ideal for before/after comparisons.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Snapshot label (default: auto)' },
        description: { type: 'string', description: 'Optional description' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const label = String(params['label'] ?? `snap_${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}`).replace(/\W+/g, '_').slice(0, 80);
    const description = params['description'] ? String(params['description']) : undefined;

    const data: GuildBackup = {
      id: guild.id, name: guild.name, description: guild.description,
      icon: guild.icon, banner: null,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      afkTimeout: guild.afkTimeout, systemChannelId: guild.systemChannelId,
      preferredLocale: guild.preferredLocale,
      categories: [...guild.channels.cache.values()]
        .filter(c => c.type === ChannelType.GuildCategory)
        .map(c => ({ id: c.id, name: c.name, type: c.type, position: c.rawPosition, parentId: null, permissionOverwrites: [] })),
      channels: [...guild.channels.cache.values()]
        .filter(c => c.type !== ChannelType.GuildCategory)
        .map(c => ({ id: c.id, name: c.name, type: c.type, position: c.rawPosition, parentId: null, permissionOverwrites: [] })),
      roles: [...guild.roles.cache.values()].filter(r => r.id !== guild.id)
        .map(r => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position })),
      emojis: [...guild.emojis.cache.values()].map(e => ({ id: e.id, name: e.name, animated: e.animated ?? false, roles: [] })),
    };

    const snap = await saveBackup({ label, type: 'snapshot', guildId: guild.id, guildName: guild.name, data, description });

    return {
      success: true,
      message: `📸 **Snapshot created** — \`${label}\` (ID: ${snap.id})\n` +
        `Categories: ${data.categories.length} | Channels: ${data.channels.length} | Roles: ${data.roles.length} | Emojis: ${data.emojis.length}\n` +
        `Use \`compare_snapshots\` to diff two snapshots.`,
      data: { id: snap.id, label },
    };
  }
}
