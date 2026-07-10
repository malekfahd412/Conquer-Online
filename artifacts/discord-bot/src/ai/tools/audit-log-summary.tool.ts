import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AuditLogSummaryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'audit_log_summary',
    description: 'Provides an aggregate summary of audit log activity: most active moderators, most common actions, activity over time.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Number of entries to analyze (default 100, max 100)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Summarize audit log activity', 'Who are the most active moderators?', 'What moderation actions happen most often?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(100, Math.max(10, parseInt(String(params['limit'] ?? '100'), 10) || 100));

    const auditLog = await guild.fetchAuditLogs({ limit });
    const entries = auditLog.entries;

    if (entries.size === 0) return { success: true, message: 'No audit log entries found.' };

    const modCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();

    entries.forEach(e => {
      const modName = e.executor?.username ?? 'Unknown';
      modCounts.set(modName, (modCounts.get(modName) ?? 0) + 1);

      const actionName = AuditLogEvent[e.action] ?? `Event#${e.action}`;
      actionCounts.set(actionName, (actionCounts.get(actionName) ?? 0) + 1);

      const day = new Date(e.createdTimestamp).toISOString().slice(0, 10);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    });

    const topMods = [...modCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([n, c]) => `  • **${n}**: ${c} actions`).join('\n');

    const topActions = [...actionCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([a, c]) => `  • **${a}**: ${c}x`).join('\n');

    const recentDays = [...dayCounts.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5)
      .map(([d, c]) => `  • ${d}: ${c} actions`).join('\n');

    const oldest = entries.last();
    const newest = entries.first();
    const spanDays = oldest && newest
      ? Math.ceil((newest.createdTimestamp - oldest.createdTimestamp) / 86400000)
      : 0;

    return {
      success: true,
      message: [
        `**📊 Audit Log Summary — ${guild.name}**`,
        `• Entries analyzed: **${entries.size}**`,
        `• Time span: **${spanDays} day(s)**`,
        ``,
        `**👮 Most Active Moderators:**`,
        topMods || '  • None',
        ``,
        `**📋 Most Common Actions:**`,
        topActions || '  • None',
        ``,
        `**📅 Activity by Day (recent):**`,
        recentDays || '  • None',
      ].join('\n'),
    };
  }
}
