import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const ACTION_MAP: Record<string, AuditLogEvent> = {
  guild_update: AuditLogEvent.GuildUpdate,
  channel_create: AuditLogEvent.ChannelCreate,
  channel_update: AuditLogEvent.ChannelUpdate,
  channel_delete: AuditLogEvent.ChannelDelete,
  member_kick: AuditLogEvent.MemberKick,
  member_ban_add: AuditLogEvent.MemberBanAdd,
  member_ban_remove: AuditLogEvent.MemberBanRemove,
  member_update: AuditLogEvent.MemberUpdate,
  member_role_update: AuditLogEvent.MemberRoleUpdate,
  role_create: AuditLogEvent.RoleCreate,
  role_update: AuditLogEvent.RoleUpdate,
  role_delete: AuditLogEvent.RoleDelete,
  invite_create: AuditLogEvent.InviteCreate,
  invite_delete: AuditLogEvent.InviteDelete,
  webhook_create: AuditLogEvent.WebhookCreate,
  webhook_update: AuditLogEvent.WebhookUpdate,
  webhook_delete: AuditLogEvent.WebhookDelete,
  emoji_create: AuditLogEvent.EmojiCreate,
  emoji_update: AuditLogEvent.EmojiUpdate,
  emoji_delete: AuditLogEvent.EmojiDelete,
  message_delete: AuditLogEvent.MessageDelete,
  message_bulk_delete: AuditLogEvent.MessageBulkDelete,
  message_pin: AuditLogEvent.MessagePin,
  message_unpin: AuditLogEvent.MessageUnpin,
  sticker_create: AuditLogEvent.StickerCreate,
  sticker_update: AuditLogEvent.StickerUpdate,
  sticker_delete: AuditLogEvent.StickerDelete,
  thread_create: AuditLogEvent.ThreadCreate,
  thread_update: AuditLogEvent.ThreadUpdate,
  thread_delete: AuditLogEvent.ThreadDelete,
  automod_block: AuditLogEvent.AutoModerationBlockMessage,
};

export class AuditLogFilterTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'audit_log_filter',
    description: 'Filters audit logs by a specific action type and returns matching entries. Supports filtering by action + optional user.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action type to filter: guild_update, channel_create, channel_update, channel_delete, member_kick, member_ban_add, member_ban_remove, member_update, member_role_update, role_create, role_update, role_delete, invite_create, invite_delete, webhook_create, webhook_delete, emoji_create, emoji_delete, message_delete, message_bulk_delete, message_pin, sticker_create, sticker_delete, thread_create, thread_delete, automod_block',
        },
        user_id: { type: 'string', description: 'Optional: filter to a specific user or moderator ID' },
        limit: { type: 'string', description: 'Number of entries to return (default: 25, max: 100)' },
      },
      required: ['action'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const actionKey = String(params['action'] ?? '').toLowerCase().replace(/ /g, '_');
    const event = ACTION_MAP[actionKey];
    if (!event) {
      return { success: false, message: `Unknown action type "${params['action']}". Valid actions: ${Object.keys(ACTION_MAP).join(', ')}` };
    }
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '25')) || 25));
    const userId = params['user_id'] ? String(params['user_id']) : undefined;

    const logs = await guild.fetchAuditLogs({ type: event, limit, user: userId });
    if (logs.entries.size === 0) return { success: true, message: `No audit log entries found for action \`${actionKey}\`` };

    const lines = [`📋 **Audit Log Filter** — \`${actionKey}\` (${logs.entries.size} entries)\n`];
    for (const entry of logs.entries.values()) {
      const who = entry.executor ? `**${entry.executor.username}**` : 'Unknown';
      const when = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
      const reason = entry.reason ? ` — _${entry.reason}_` : '';
      const target = entry.target && 'username' in entry.target ? ` → ${entry.target.username}` : entry.targetId ? ` → \`${entry.targetId}\`` : '';
      lines.push(`• ${who}${target} ${when}${reason}`);
    }
    return { success: true, message: lines.join('\n') };
  }
}
