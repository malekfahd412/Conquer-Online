import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AuditLogSearchTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'audit_log_search',
    description: 'Searches audit log entries by keyword in the reason field, or by target/executor name. Returns matching entries.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search in audit log reasons, executor names, or target names' },
        limit: { type: 'string', description: 'Number of entries to scan (default 100, max 100)' },
      },
      required: ['query'],
    },
    dangerous: false,
    examples: ['Search audit log for "spam"', 'Find audit log entries mentioning "raid"', 'Search audit log reason for "rule violation"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['query'] ?? '').toLowerCase().trim();
    const limit = Math.min(100, Math.max(10, parseInt(String(params['limit'] ?? '100'), 10) || 100));
    if (!query) return { success: false, message: 'Search query is required' };

    const auditLog = await guild.fetchAuditLogs({ limit });
    const matches = auditLog.entries.filter(e => {
      const reason = e.reason?.toLowerCase() ?? '';
      const executor = e.executor?.username?.toLowerCase() ?? '';
      const target = e.target as { username?: string; name?: string } | null;
      const targetName = (target?.username ?? target?.name ?? '').toLowerCase();
      return reason.includes(query) || executor.includes(query) || targetName.includes(query);
    });

    if (matches.size === 0) {
      return { success: true, message: `No audit log entries found matching **"${query}"**` };
    }

    const lines = matches.first(15).map(e => {
      const actionName = AuditLogEvent[e.action] ?? `Event#${e.action}`;
      const executor = e.executor?.username ?? 'Unknown';
      const target = e.target as { username?: string; name?: string; id?: string } | null;
      const targetName = target?.username ?? target?.name ?? target?.id ?? 'N/A';
      const reason = e.reason ? ` — _${e.reason}_` : '';
      return `• <t:${Math.floor(e.createdTimestamp / 1000)}:R> **${executor}** → **${actionName}** on \`${targetName}\`${reason}`;
    });

    return {
      success: true,
      message: [
        `**🔍 Audit Log Search: "${query}" — ${matches.size} match(es):**`,
        ...lines,
      ].join('\n'),
    };
  }
}
