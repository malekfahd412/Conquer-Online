import type { Guild } from 'discord.js';
import { AuditLogEvent } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AuditLogByTargetTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'audit_log_by_target',
    description: 'Shows all audit log actions taken against a specific member — bans, kicks, role changes, timeouts, nickname changes, etc.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Target member username, display name, or user ID' },
        limit: { type: 'string', description: 'Max entries to scan (default 100)' },
      },
      required: ['user'],
    },
    dangerous: false,
    examples: ['Show all actions against JohnDoe', 'What moderation actions have been taken on user 123456789?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '100'), 10) || 100));

    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);

    let targetId: string;
    let targetName: string;

    if (member) {
      targetId = member.id;
      targetName = member.displayName;
    } else if (/^\d{17,20}$/.test(query)) {
      targetId = query;
      targetName = query;
      // Try to fetch user
      try {
        const user = await guild.client.users.fetch(query);
        targetName = user.username;
      } catch { /* use raw ID */ }
    } else {
      return { success: false, message: `Member "${params['user']}" not found. Provide a username or user ID.` };
    }

    const auditLog = await guild.fetchAuditLogs({ limit });
    const entries = auditLog.entries.filter(e => {
      const t = e.target as { id?: string } | null;
      return t?.id === targetId;
    });

    if (entries.size === 0) {
      return { success: true, message: `No audit log actions found against **${targetName}** (ID: ${targetId})` };
    }

    const lines = entries.first(20).map(e => {
      const actionName = AuditLogEvent[e.action] ?? `Event#${e.action}`;
      const executor = e.executor ? `by **${e.executor.username}**` : 'by *unknown*';
      const reason = e.reason ? ` — _${e.reason}_` : '';
      return `• <t:${Math.floor(e.createdTimestamp / 1000)}:R> **${actionName}** ${executor}${reason}`;
    });

    return {
      success: true,
      message: [
        `**🎯 Audit Log against ${targetName} (${entries.size} actions):**`,
        ...lines,
      ].join('\n'),
    };
  }
}
