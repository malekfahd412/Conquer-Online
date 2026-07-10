import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const ACTION_MAP: Record<string, AuditLogEvent> = {
  ban: AuditLogEvent.MemberBanAdd,
  unban: AuditLogEvent.MemberBanRemove,
  kick: AuditLogEvent.MemberKick,
  timeout: AuditLogEvent.MemberUpdate,
  role_update: AuditLogEvent.MemberRoleUpdate,
  channel_create: AuditLogEvent.ChannelCreate,
  channel_delete: AuditLogEvent.ChannelDelete,
  channel_update: AuditLogEvent.ChannelUpdate,
  role_create: AuditLogEvent.RoleCreate,
  role_delete: AuditLogEvent.RoleDelete,
  role_change: AuditLogEvent.RoleUpdate,
  message_delete: AuditLogEvent.MessageDelete,
  message_bulk_delete: AuditLogEvent.MessageBulkDelete,
  message_pin: AuditLogEvent.MessagePin,
  message_unpin: AuditLogEvent.MessageUnpin,
  invite_create: AuditLogEvent.InviteCreate,
  invite_delete: AuditLogEvent.InviteDelete,
  webhook_create: AuditLogEvent.WebhookCreate,
  webhook_delete: AuditLogEvent.WebhookDelete,
  thread_create: AuditLogEvent.ThreadCreate,
  thread_delete: AuditLogEvent.ThreadDelete,
  nickname: AuditLogEvent.MemberUpdate,
  guild_update: AuditLogEvent.GuildUpdate,
  event_create: AuditLogEvent.ScheduledEventCreate,
  event_delete: AuditLogEvent.ScheduledEventDelete,
  prune: AuditLogEvent.MemberPrune,
};

function formatEntry(entry: { action: AuditLogEvent; executor: { username?: string; id: string } | null; target: { username?: string; id: string; name?: string } | null; reason: string | null; createdTimestamp: number }): string {
  const actionName = AuditLogEvent[entry.action] ?? `Event#${entry.action}`;
  const executor = entry.executor ? `**${entry.executor.username ?? entry.executor.id}**` : 'Unknown';
  const target = entry.target ? (entry.target as { username?: string; id: string; name?: string }).username ?? (entry.target as { name?: string }).name ?? entry.target.id : 'N/A';
  const reason = entry.reason ? ` — _${entry.reason}_` : '';
  const ts = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
  return `• ${ts} ${executor} → **${actionName}** on \`${target}\`${reason}`;
}

export class ViewAuditLogTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'view_audit_log',
    description: 'Queries the Discord audit log with optional filters. Filter by action type, moderator, date range, or fetch the latest N entries.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action type filter: ban, unban, kick, timeout, role_update, channel_create, channel_delete, channel_update, role_create, role_delete, role_change, message_delete, message_bulk_delete, message_pin, invite_create, webhook_create, thread_create, guild_update, event_create, prune (leave blank for all)',
        },
        moderator: { type: 'string', description: 'Filter by moderator username or ID who performed the action' },
        limit: { type: 'string', description: 'Number of entries to fetch (default 25, max 100)' },
        before: { type: 'string', description: 'Show entries before this ISO date (e.g. 2025-01-01)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Show latest audit log entries', 'Show all bans in the audit log', 'Show audit log actions by JohnMod', 'Show the last 50 audit log entries before 2025-06-01'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '25'), 10) || 25));
    const actionKey = String(params['action'] ?? '').toLowerCase().trim();
    const modQuery = String(params['moderator'] ?? '').toLowerCase().trim();
    const beforeDate = params['before'] ? new Date(String(params['before'])) : null;

    const fetchOptions: Parameters<typeof guild.fetchAuditLogs>[0] = { limit };

    if (actionKey && ACTION_MAP[actionKey]) {
      fetchOptions.type = ACTION_MAP[actionKey];
    }

    const auditLog = await guild.fetchAuditLogs(fetchOptions);
    let entries = auditLog.entries;

    if (modQuery) {
      entries = entries.filter(e =>
        e.executor?.id === modQuery ||
        e.executor?.username?.toLowerCase().includes(modQuery) === true,
      );
    }

    if (beforeDate && !isNaN(beforeDate.getTime())) {
      entries = entries.filter(e => e.createdTimestamp < beforeDate.getTime());
    }

    if (entries.size === 0) return { success: true, message: 'No audit log entries found matching the filters.' };

    const lines = entries.first(25).map(e => formatEntry(e as Parameters<typeof formatEntry>[0]));
    const header = `**📋 Audit Log — ${guild.name} (${entries.size} entries${actionKey ? `, type: ${actionKey}` : ''})**`;

    return { success: true, message: `${header}\n${lines.join('\n')}` };
  }
}
