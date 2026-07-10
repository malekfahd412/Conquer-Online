import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionChangesLogTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_changes_log',
    description: 'Shows audit log history of permission changes: channel overwrites, role permission edits.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Entries per event type (default: 20)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '20')) || 20));
    const events = [
      AuditLogEvent.ChannelOverwriteCreate,
      AuditLogEvent.ChannelOverwriteUpdate,
      AuditLogEvent.ChannelOverwriteDelete,
      AuditLogEvent.RoleUpdate,
    ];
    const allEntries = [];
    for (const event of events) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit });
        allEntries.push(...logs.entries.values());
      } catch { /* skip */ }
    }
    allEntries.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    if (allEntries.length === 0) return { success: true, message: 'No permission changes found in audit log' };

    const lines = [`🔐 **Permission Changes Log** — **${guild.name}** (${allEntries.length} entries)\n`];
    for (const entry of allEntries.slice(0, 25)) {
      const who = entry.executor?.username ?? 'Unknown';
      const when = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
      const action = entry.action.toString().replace(/_/g, ' ').toLowerCase();
      const targetName = entry.target && 'name' in entry.target
        ? (entry.target as { name: string }).name
        : entry.targetId ?? '?';
      const changesCount = entry.changes?.length ?? 0;
      lines.push(`• ${when} **${who}** — \`${action}\` on **${targetName}**${changesCount ? ` (${changesCount} change(s))` : ''}`);
    }
    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
