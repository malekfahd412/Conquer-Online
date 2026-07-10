import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listBackupsFull, saveBackup, type GuildBackup } from './backup-store';

export class IncrementalBackupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'incremental_backup',
    description: 'Creates an incremental backup by comparing the current server state against the most recent full backup and storing only the differences (new/changed names).',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label for this incremental backup (default: auto)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const allBackups = await listBackupsFull(guild.id);
    const lastFull = allBackups.find(b => b.type === 'full');

    const label = String(params['label'] ?? `incr_${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}`).replace(/\W+/g, '_').slice(0, 80);

    const currentChannels = [...guild.channels.cache.values()].filter(c => c.type !== ChannelType.GuildCategory).map(c => c.name);
    const currentRoles = [...guild.roles.cache.values()].filter(r => r.id !== guild.id).map(r => r.name);
    const currentEmojis = [...guild.emojis.cache.values()].map(e => e.name ?? '');

    let newChannels = currentChannels;
    let newRoles = currentRoles;
    let newEmojis = currentEmojis;
    let changes = 0;

    if (lastFull) {
      const prevChNames = new Set(lastFull.data.channels.map(c => c.name));
      const prevRoleNames = new Set(lastFull.data.roles.map(r => r.name));
      const prevEmojiNames = new Set(lastFull.data.emojis.map(e => e.name ?? ''));
      newChannels = currentChannels.filter(n => !prevChNames.has(n));
      newRoles = currentRoles.filter(n => !prevRoleNames.has(n));
      newEmojis = currentEmojis.filter(n => !prevEmojiNames.has(n));
      changes = newChannels.length + newRoles.length + newEmojis.length;
    }

    const data: GuildBackup = {
      id: guild.id, name: guild.name, description: guild.description,
      icon: guild.icon, banner: null,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      afkTimeout: guild.afkTimeout, systemChannelId: guild.systemChannelId,
      preferredLocale: guild.preferredLocale,
      categories: [],
      channels: newChannels.map(n => ({ id: '', name: n, type: 0, position: 0, parentId: null, permissionOverwrites: [] })),
      roles: newRoles.map(n => ({ id: '', name: n, color: 0, hoist: false, mentionable: false, permissions: '0', position: 0 })),
      emojis: newEmojis.map(n => ({ id: null, name: n, animated: false, roles: [] })),
    };

    const incr = await saveBackup({
      label, type: 'incremental', guildId: guild.id, guildName: guild.name, data,
      parentId: lastFull?.id,
      description: `Incremental vs ${lastFull?.label ?? 'no prior backup'}`,
    });

    return {
      success: true,
      message: `🔄 **Incremental backup created** — \`${label}\` (ID: ${incr.id})\n` +
        `Changes since last full backup: ${changes}\n` +
        `New channels: ${newChannels.length} | New roles: ${newRoles.length} | New emojis: ${newEmojis.length}\n` +
        (lastFull ? `Based on: \`${lastFull.label}\`` : `⚠️ No prior full backup found — stored current state names as incremental baseline.`),
      data: { id: incr.id, label },
    };
  }
}
