import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RoleChangesLogTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'role_changes_log',
    description: 'Shows the audit log history of role creation, updates, deletions, and member role assignments.',
    parameters: {
      type: 'object',
      properties: {
        role_name: { type: 'string', description: 'Optional: filter to a specific role name' },
        limit: { type: 'string', description: 'Number of entries per event type (default: 15)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '15')) || 15));
    const roleFilter = String(params['role_name'] ?? '').toLowerCase().trim();

    const events = [AuditLogEvent.RoleCreate, AuditLogEvent.RoleUpdate, AuditLogEvent.RoleDelete, AuditLogEvent.MemberRoleUpdate];
    const allEntries = [];
    for (const event of events) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit });
        allEntries.push(...logs.entries.values());
      } catch { /* skip */ }
    }
    allEntries.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const filtered = roleFilter
      ? allEntries.filter(e => {
          const name = e.target && 'name' in e.target ? (e.target as { name: string }).name?.toLowerCase() : '';
          return name?.includes(roleFilter);
        })
      : allEntries;

    if (filtered.length === 0) {
      return { success: true, message: roleFilter ? `No role changes found for "${params['role_name']}"` : 'No role changes in audit log' };
    }

    const lines = [`🎭 **Role Changes Log** — **${guild.name}**${roleFilter ? ` (filtered: "${params['role_name']}")` : ''}\n`];
    for (const entry of filtered.slice(0, 30)) {
      const who = entry.executor ? entry.executor.username : 'Unknown';
      const when = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
      const action = entry.action.toString().replace(/_/g, ' ').toLowerCase();
      const targetName = entry.target && 'name' in entry.target
        ? (entry.target as { name: string }).name
        : entry.targetId ?? '?';
      const reason = entry.reason ? ` _(${entry.reason})_` : '';
      lines.push(`• ${when} **${who}** — \`${action}\` on **${targetName}**${reason}`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
