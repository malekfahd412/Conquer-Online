import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

// discord-api-types v10 numeric values (stable, version-independent)
const VERIFICATION_LEVEL: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  very_high: 4,
};

const EXPLICIT_CONTENT_FILTER: Record<string, number> = {
  disabled: 0,
  members_without_roles: 1,
  all_members: 2,
};

const DEFAULT_NOTIFICATIONS: Record<string, number> = {
  all_messages: 0,
  only_mentions: 1,
};

export class EditGuildTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_guild',
    description: 'Edits core server settings: name, description, AFK channel, AFK timeout, locale, verification level, explicit content filter, default notifications, or system channel.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'New server name (optional)' },
        description: { type: 'string', description: 'New server description (optional, Community servers only)' },
        preferred_locale: { type: 'string', description: 'Preferred locale code, e.g. en-US, es-ES, ar (optional)' },
        afk_channel: { type: 'string', description: 'Name of voice channel to use as AFK channel, or "none" to remove (optional)' },
        afk_timeout: { type: 'string', enum: ['60', '300', '900', '1800', '3600'], description: 'AFK timeout in seconds (optional)' },
        verification_level: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'very_high'], description: 'Member verification level (optional)' },
        explicit_content_filter: { type: 'string', enum: ['disabled', 'members_without_roles', 'all_members'], description: 'Explicit content filter level (optional)' },
        default_notifications: { type: 'string', enum: ['all_messages', 'only_mentions'], description: 'Default notification setting (optional)' },
        system_channel: { type: 'string', description: 'Name of channel for system messages, or "none" to remove (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: [
      'Rename the server to "Mufasa Conquer"',
      'Set AFK channel to "AFK" with 5 minute timeout',
      'Change verification level to high',
      'Set preferred locale to en-US',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const changes: Record<string, unknown> = {};
    const summary: string[] = [];

    if (params['name']) {
      changes['name'] = String(params['name']).trim();
      summary.push(`name → **${changes['name']}**`);
    }

    if (params['description'] !== undefined) {
      changes['description'] = params['description'] ? String(params['description']).trim() : null;
      summary.push('description updated');
    }

    if (params['preferred_locale']) {
      changes['preferredLocale'] = String(params['preferred_locale']).trim();
      summary.push(`locale → **${changes['preferredLocale']}**`);
    }

    if (params['afk_timeout']) {
      changes['afkTimeout'] = parseInt(String(params['afk_timeout']), 10);
      summary.push(`AFK timeout → **${changes['afkTimeout']}s**`);
    }

    if (params['afk_channel'] !== undefined) {
      const afkName = String(params['afk_channel']).trim().toLowerCase();
      if (afkName === 'none') {
        changes['afkChannel'] = null;
        summary.push('AFK channel removed');
      } else {
        const vc = guild.channels.cache.find(
          c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === afkName,
        );
        if (!vc) return { success: false, message: `Voice channel "${params['afk_channel']}" not found` };
        changes['afkChannel'] = vc.id;
        summary.push(`AFK channel → **${vc.name}**`);
      }
    }

    if (params['system_channel'] !== undefined) {
      const scName = String(params['system_channel']).trim().toLowerCase();
      if (scName === 'none') {
        changes['systemChannel'] = null;
        summary.push('System channel removed');
      } else {
        const sc = guild.channels.cache.find(
          c => c.type === ChannelType.GuildText && c.name.toLowerCase() === scName,
        );
        if (!sc) return { success: false, message: `Text channel "${params['system_channel']}" not found` };
        changes['systemChannel'] = sc.id;
        summary.push(`System channel → **#${sc.name}**`);
      }
    }

    if (params['verification_level']) {
      const key = String(params['verification_level']).toLowerCase();
      if (!(key in VERIFICATION_LEVEL)) return { success: false, message: 'Invalid verification level' };
      changes['verificationLevel'] = VERIFICATION_LEVEL[key];
      summary.push(`verification → **${key}**`);
    }

    if (params['explicit_content_filter']) {
      const key = String(params['explicit_content_filter']).toLowerCase();
      if (!(key in EXPLICIT_CONTENT_FILTER)) return { success: false, message: 'Invalid explicit content filter' };
      changes['explicitContentFilter'] = EXPLICIT_CONTENT_FILTER[key];
      summary.push(`explicit content filter → **${key}**`);
    }

    if (params['default_notifications']) {
      const key = String(params['default_notifications']).toLowerCase();
      if (!(key in DEFAULT_NOTIFICATIONS)) return { success: false, message: 'Invalid default notification level' };
      changes['defaultMessageNotifications'] = DEFAULT_NOTIFICATIONS[key];
      summary.push(`notifications → **${key}**`);
    }

    if (Object.keys(changes).length === 0) {
      return { success: false, message: 'No settings provided to change. Specify at least one option.' };
    }

    await guild.edit(changes as Parameters<typeof guild.edit>[0]);
    return { success: true, message: `✅ Server settings updated:\n${summary.map(s => `• ${s}`).join('\n')}` };
  }
}
