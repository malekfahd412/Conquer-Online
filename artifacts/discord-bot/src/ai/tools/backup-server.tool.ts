import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { saveBackup, type GuildBackup, type ChannelBackup, type RoleBackup } from './backup-store';

export class BackupServerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'backup_server',
    description: 'Creates a full backup of the server structure: all categories, channels, roles, and emojis serialized to disk. Does not back up messages (Discord API limitation).',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label for this backup (default: auto-generated from timestamp)' },
        description: { type: 'string', description: 'Optional description for this backup' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const label = String(params['label'] ?? `backup_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`).replace(/\W+/g, '_').slice(0, 80);
    const description = params['description'] ? String(params['description']) : undefined;

    // Serialize categories
    const categories: ChannelBackup[] = [...guild.channels.cache.values()]
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map(c => ({
        id: c.id, name: c.name, type: c.type, position: c.rawPosition, parentId: null,
        permissionOverwrites: [...c.permissionOverwrites.cache.values()].map(ow => ({
          id: ow.id, type: ow.type, allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString(),
        })),
      }));

    // Serialize channels (non-category)
    const channels: ChannelBackup[] = [...guild.channels.cache.values()]
      .filter(c => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map(c => {
        const ch: ChannelBackup = {
          id: c.id, name: c.name, type: c.type, position: c.rawPosition,
          parentId: 'parentId' in c ? (c as { parentId?: string | null }).parentId ?? null : null,
          permissionOverwrites: [...c.permissionOverwrites.cache.values()].map(ow => ({
            id: ow.id, type: ow.type, allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString(),
          })),
        };
        if ('topic' in c) ch.topic = (c as { topic?: string | null }).topic;
        if ('nsfw' in c) ch.nsfw = (c as { nsfw?: boolean }).nsfw;
        if ('rateLimitPerUser' in c) ch.rateLimitPerUser = (c as { rateLimitPerUser?: number }).rateLimitPerUser;
        if ('bitrate' in c) ch.bitrate = (c as { bitrate?: number }).bitrate;
        if ('userLimit' in c) ch.userLimit = (c as { userLimit?: number }).userLimit;
        return ch;
      });

    // Serialize roles (excluding @everyone and managed)
    const roles: RoleBackup[] = [...guild.roles.cache.values()]
      .filter(r => r.id !== guild.id)
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        id: r.id, name: r.name, color: r.color, hoist: r.hoist,
        mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position,
      }));

    // Serialize emojis
    const emojis = [...guild.emojis.cache.values()].map(e => ({
      id: e.id, name: e.name, imageURL: e.url, animated: e.animated ?? false,
      roles: [...e.roles.cache.keys()],
    }));

    const data: GuildBackup = {
      id: guild.id, name: guild.name, description: guild.description,
      icon: guild.icon, banner: guild.banner,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      afkTimeout: guild.afkTimeout,
      systemChannelId: guild.systemChannelId,
      preferredLocale: guild.preferredLocale,
      categories, channels, roles, emojis,
    };

    const backup = await saveBackup({
      label, type: 'full', guildId: guild.id, guildName: guild.name, data, description,
    });

    return {
      success: true,
      message: `✅ **Full backup created** — \`${label}\` (ID: ${backup.id})\n` +
        `📦 Categories: ${categories.length} | Channels: ${channels.length} | Roles: ${roles.length} | Emojis: ${emojis.length}\n` +
        `💾 Size: ~${Math.round((backup.size ?? 0) / 1024)}KB\n` +
        `⚠️ **Discord API limitation:** Message history cannot be backed up.`,
      data: { id: backup.id, label },
    };
  }
}
