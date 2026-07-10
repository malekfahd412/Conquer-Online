import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const CATEGORIES: Record<string, AuditLogEvent[]> = {
  channels: [AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelDelete],
  roles: [AuditLogEvent.RoleCreate, AuditLogEvent.RoleUpdate, AuditLogEvent.RoleDelete],
  members: [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove, AuditLogEvent.MemberUpdate, AuditLogEvent.MemberRoleUpdate],
  messages: [AuditLogEvent.MessageDelete, AuditLogEvent.MessageBulkDelete],
  server: [AuditLogEvent.GuildUpdate],
};

export class RecentChangesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'recent_changes',
    description: 'Shows a summary of recent server changes grouped by category: channels, roles, members, messages, and server settings.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Number of entries to scan per category (default: 20)' },
        category: {
          type: 'string',
          description: 'Filter to a specific category: channels, roles, members, messages, server (default: all)',
          enum: ['channels', 'roles', 'members', 'messages', 'server', 'all'],
        },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '20')) || 20));
    const catFilter = String(params['category'] ?? 'all').toLowerCase();

    const cats = catFilter === 'all' ? CATEGORIES : (CATEGORIES[catFilter] ? { [catFilter]: CATEGORIES[catFilter] } : CATEGORIES);
    const lines = [`🔄 **Recent Changes** — **${guild.name}**\n`];

    for (const [cat, events] of Object.entries(cats)) {
      const allEntries = [];
      for (const event of events) {
        try {
          const logs = await guild.fetchAuditLogs({ type: event, limit });
          allEntries.push(...logs.entries.values());
        } catch { /* skip unsupported event */ }
      }
      allEntries.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      if (allEntries.length === 0) continue;

      lines.push(`**📁 ${cat.toUpperCase()} (${allEntries.length} recent):**`);
      for (const entry of allEntries.slice(0, 5)) {
        const who = entry.executor ? entry.executor.username : 'Unknown';
        const when = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
        const action = entry.action.toString().replace(/_/g, ' ').toLowerCase();
        const targetName = entry.target && 'name' in entry.target ? (entry.target as { name: string }).name : entry.targetId ?? '?';
        lines.push(`  • ${when} **${who}** — ${action} \`${targetName}\``);
      }
      lines.push('');
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
