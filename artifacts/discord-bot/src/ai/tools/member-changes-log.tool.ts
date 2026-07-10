import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MemberChangesLogTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'member_changes_log',
    description: 'Shows audit log history of member events: kicks, bans, unbans, timeouts, nickname changes, and role assignments.',
    parameters: {
      type: 'object',
      properties: {
        member_name: { type: 'string', description: 'Optional: filter by target member username or ID' },
        event_type: {
          type: 'string',
          description: 'Filter by event: kick, ban, unban, timeout, update, roles (default: all)',
          enum: ['kick', 'ban', 'unban', 'timeout', 'update', 'roles', 'all'],
        },
        limit: { type: 'string', description: 'Entries per event type (default: 15)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '15')) || 15));
    const memberFilter = String(params['member_name'] ?? '').toLowerCase().trim();
    const evtFilter = String(params['event_type'] ?? 'all').toLowerCase();

    const eventMap: Record<string, AuditLogEvent[]> = {
      kick: [AuditLogEvent.MemberKick],
      ban: [AuditLogEvent.MemberBanAdd],
      unban: [AuditLogEvent.MemberBanRemove],
      update: [AuditLogEvent.MemberUpdate],
      roles: [AuditLogEvent.MemberRoleUpdate],
      all: [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove, AuditLogEvent.MemberUpdate, AuditLogEvent.MemberRoleUpdate],
    };
    const events = eventMap[evtFilter] ?? eventMap['all'];

    const allEntries = [];
    for (const event of events) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit });
        allEntries.push(...logs.entries.values());
      } catch { /* skip */ }
    }
    allEntries.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const filtered = memberFilter
      ? allEntries.filter(e => {
          const targetName = e.target && 'username' in e.target ? (e.target as { username: string }).username?.toLowerCase() : '';
          return (e.targetId === memberFilter) || targetName?.includes(memberFilter);
        })
      : allEntries;

    if (filtered.length === 0) return { success: true, message: 'No member changes found matching the criteria' };

    const lines = [`👥 **Member Changes Log** — **${guild.name}**\n`];
    for (const entry of filtered.slice(0, 30)) {
      const who = entry.executor ? entry.executor.username : 'Unknown';
      const target = entry.target && 'username' in entry.target ? (entry.target as { username: string }).username : entry.targetId ?? '?';
      const when = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
      const action = entry.action.toString().replace(/_/g, ' ').toLowerCase();
      const reason = entry.reason ? ` _(${entry.reason})_` : '';
      lines.push(`• ${when} **${who}** → **${target}** — \`${action}\`${reason}`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
