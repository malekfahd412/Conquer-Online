import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AuditTimelineTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'audit_timeline',
    description: 'Shows a chronological timeline of all server changes from the audit log — who changed what, and when.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Number of recent entries to show (default: 30, max: 100)' },
        compact: { type: 'string', description: 'Set to "true" for compact one-line entries' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '30')) || 30));
    const compact = String(params['compact'] ?? '').toLowerCase() === 'true';

    const logs = await guild.fetchAuditLogs({ limit });
    if (logs.entries.size === 0) return { success: true, message: 'No audit log entries found' };

    const entries = [...logs.entries.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const lines = [`📅 **Audit Timeline** — Last ${entries.length} changes in **${guild.name}**\n`];

    for (const entry of entries) {
      const who = entry.executor ? entry.executor.username : 'Unknown';
      const when = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
      const action = entry.action.toString().replace(/_/g, ' ').toLowerCase();
      const targetName = entry.target && 'username' in entry.target
        ? entry.target.username
        : entry.target && 'name' in entry.target
          ? (entry.target as { name: string }).name
          : entry.targetId ?? '?';
      const reason = entry.reason ? ` _(${entry.reason})_` : '';

      if (compact) {
        lines.push(`\`${when}\` **${who}** — ${action} \`${targetName}\`${reason}`);
      } else {
        lines.push(`**${when}** — **${who}** performed \`${action}\` on \`${targetName}\`${reason}`);
      }
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
