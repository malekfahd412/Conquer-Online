import { promises as fs } from 'fs';
import path from 'path';
import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ExportAuditLogTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_audit_log',
    description: 'Exports audit log entries to a JSON file in data/. Supports filtering by action type or moderator before export.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Number of entries to export (default 100, max 100)' },
        moderator: { type: 'string', description: 'Filter by moderator username or ID (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Export full audit log', 'Export audit log filtered to moderator JohnMod'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '100'), 10) || 100));
    const modQuery = String(params['moderator'] ?? '').toLowerCase().trim();

    const fetchOptions: Parameters<typeof guild.fetchAuditLogs>[0] = { limit };
    const auditLog = await guild.fetchAuditLogs(fetchOptions);

    let entries = auditLog.entries;
    if (modQuery) {
      entries = entries.filter(e =>
        e.executor?.id === modQuery ||
        e.executor?.username?.toLowerCase().includes(modQuery) === true,
      );
    }

    const data = entries.map(e => {
      const target = e.target as { id?: string; username?: string; name?: string } | null;
      return {
        id: e.id,
        action: AuditLogEvent[e.action] ?? `Event#${e.action}`,
        actionCode: e.action,
        executor: e.executor ? { id: e.executor.id, username: e.executor.username } : null,
        target: target ? { id: target.id, name: target.username ?? target.name ?? null } : null,
        reason: e.reason ?? null,
        timestamp: new Date(e.createdTimestamp).toISOString(),
        changes: e.changes?.map(c => ({ key: c.key, old: c.old, new: c.new })) ?? [],
      };
    });

    const filename = `audit-log-${guild.id}-${Date.now()}.json`;
    const filepath = path.join(process.cwd(), 'data', filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ Exported **${data.length}** audit log entries to \`data/${filename}\`\n• Includes: action type, executor, target, reason, timestamp, and change details`,
    };
  }
}
