import { AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ChannelChangesLogTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'channel_changes_log',
    description: 'Shows the audit log history of channel creation, updates, deletions, and permission overwrites.',
    parameters: {
      type: 'object',
      properties: {
        channel_name: { type: 'string', description: 'Optional: filter to a specific channel name' },
        limit: { type: 'string', description: 'Entries per event type (default: 15)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(50, Math.max(1, parseInt(String(params['limit'] ?? '15')) || 15));
    const chFilter = String(params['channel_name'] ?? '').toLowerCase().trim();

    const events = [
      AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelDelete,
      AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete,
    ];

    const allEntries = [];
    for (const event of events) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit });
        allEntries.push(...logs.entries.values());
      } catch { /* skip */ }
    }
    allEntries.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const filtered = chFilter
      ? allEntries.filter(e => {
          const name = e.target && 'name' in e.target ? (e.target as { name: string }).name?.toLowerCase() : '';
          return name?.includes(chFilter);
        })
      : allEntries;

    if (filtered.length === 0) return { success: true, message: 'No channel changes found in audit log' };

    const lines = [`📺 **Channel Changes Log** — **${guild.name}**${chFilter ? ` (filtered: "${params['channel_name']}")` : ''}\n`];
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
