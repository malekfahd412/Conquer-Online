import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { AuditLogEvent } from 'discord.js';

export class AuditLogByModeratorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'audit_log_by_moderator',
    description: 'Shows all audit log actions performed by a specific moderator, sorted by most recent.',
    parameters: {
      type: 'object',
      properties: {
        moderator: { type: 'string', description: 'Moderator username, display name, or user ID' },
        limit: { type: 'string', description: 'Max entries to scan (default 100)' },
      },
      required: ['moderator'],
    },
    dangerous: false,
    examples: ['Show all audit log actions by JohnMod', 'What has admin123 done in the server?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const modQuery = String(params['moderator'] ?? '').toLowerCase().trim();
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '100'), 10) || 100));

    // Resolve moderator ID
    const members = await guild.members.fetch();
    const mod = members.find(m => m.id === modQuery || m.user.username.toLowerCase() === modQuery || m.displayName.toLowerCase() === modQuery);
    const modId = mod?.id ?? modQuery;
    const modName = mod?.displayName ?? modQuery;

    const auditLog = await guild.fetchAuditLogs({ limit });
    const entries = auditLog.entries.filter(e => e.executor?.id === modId);

    if (entries.size === 0) {
      return { success: true, message: `No audit log actions found for **${modName}** (ID: ${modId})` };
    }

    // Summarize action types
    const actionCounts = new Map<string, number>();
    entries.forEach(e => {
      const name = AuditLogEvent[e.action] ?? `Event#${e.action}`;
      actionCounts.set(name, (actionCounts.get(name) ?? 0) + 1);
    });

    const summary = [...actionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([a, c]) => `  • ${a}: **${c}**`)
      .join('\n');

    const recent = entries.first(10).map(e => {
      const actionName = AuditLogEvent[e.action] ?? `Event#${e.action}`;
      const target = e.target as { username?: string; name?: string; id?: string } | null;
      const targetName = target?.username ?? target?.name ?? target?.id ?? 'N/A';
      const reason = e.reason ? ` — _${e.reason}_` : '';
      return `• <t:${Math.floor(e.createdTimestamp / 1000)}:R> **${actionName}** on \`${targetName}\`${reason}`;
    });

    return {
      success: true,
      message: [
        `**👮 Audit Log for ${modName} (${entries.size} actions found):**`,
        ``,
        `**Action Summary:**`,
        summary,
        ``,
        `**Most Recent (${Math.min(10, entries.size)}):**`,
        ...recent,
      ].join('\n'),
    };
  }
}
