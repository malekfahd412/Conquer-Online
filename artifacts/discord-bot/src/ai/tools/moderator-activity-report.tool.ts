import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const MOD_EVENTS = [
  AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove,
  AuditLogEvent.MemberUpdate, AuditLogEvent.MemberRoleUpdate, AuditLogEvent.MessageDelete,
  AuditLogEvent.MessageBulkDelete, AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete,
];

export class ModeratorActivityReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'moderator_activity_report',
    description: 'Generates a summary of all moderator activity from the audit log — ranks mods by action count and breaks down action types per moderator.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Entries to scan per event type (default: 30)' },
        top: { type: 'string', description: 'Show top N moderators (default: 10)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '30')) || 30));
    const top = Math.min(20, Math.max(1, parseInt(String(params['top'] ?? '10')) || 10));

    const modStats: Record<string, { username: string; actions: Record<string, number>; total: number }> = {};

    for (const event of MOD_EVENTS) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit });
        for (const entry of logs.entries.values()) {
          if (!entry.executor) continue;
          const id = entry.executor.id;
          if (!modStats[id]) modStats[id] = { username: entry.executor.username ?? entry.executor.id, actions: {}, total: 0 };
          const actionKey = entry.action.toString().replace(/_/g, ' ').toLowerCase();
          modStats[id].actions[actionKey] = (modStats[id].actions[actionKey] ?? 0) + 1;
          modStats[id].total++;
        }
      } catch { /* skip */ }
    }

    const ranked = Object.values(modStats).sort((a, b) => b.total - a.total).slice(0, top);
    if (ranked.length === 0) return { success: true, message: 'No moderator activity found in audit log' };

    const lines = [`🛡️ **Moderator Activity Report** — **${guild.name}**\n`];
    for (const [i, mod] of ranked.entries()) {
      lines.push(`**${i + 1}. ${mod.username}** — ${mod.total} action(s)`);
      const topActions = Object.entries(mod.actions).sort(([, a], [, b]) => b - a).slice(0, 4);
      lines.push(`  ${topActions.map(([a, c]) => `\`${a}\`×${c}`).join(' | ')}`);
    }
    lines.push(`\n_Scanned last ~${limit} entries per event type_`);

    return { success: true, message: lines.join('\n') };
  }
}
