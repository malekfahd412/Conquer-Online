import { ChannelType, AuditLogEvent } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DailyReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'daily_report',
    description: 'Generates a daily server summary: current member count, online status, voice usage, recent moderation actions from today\'s audit log, and active threads.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const members = guild.members.cache;
    const online = members.filter(m => m.presence?.status === 'online').size;
    let inVoice = 0;
    for (const [, ch] of guild.channels.cache) {
      if (ch.type === ChannelType.GuildVoice && 'members' in ch) inVoice += (ch as { members: { size: number } }).members.size;
    }

    const modEvents = [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove, AuditLogEvent.MessageDelete, AuditLogEvent.MessageBulkDelete];
    const todayActions: Array<{ action: string; by: string }> = [];
    for (const event of modEvents) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit: 20 });
        for (const entry of logs.entries.values()) {
          if (entry.createdTimestamp >= startOfDay) {
            todayActions.push({ action: entry.action.toString().replace(/_/g, ' ').toLowerCase(), by: entry.executor?.username ?? 'Unknown' });
          }
        }
      } catch { /* skip */ }
    }

    let activeThreads = 0;
    try { activeThreads = (await guild.channels.fetchActiveThreads()).threads.size; } catch {}

    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [
      `📋 **Daily Report** — **${guild.name}**`,
      `📅 ${dateStr}`,
      '',
      `**👥 Members:** ${guild.memberCount} total | ${online} online | ${inVoice} in voice`,
      `**💬 Active Threads:** ${activeThreads}`,
      '',
      `**🛡️ Today's Moderation Actions (${todayActions.length}):**`,
    ];
    if (todayActions.length === 0) lines.push('  ✅ No moderation actions today');
    else for (const a of todayActions.slice(0, 10)) lines.push(`  • **${a.by}** — ${a.action}`);

    lines.push('', `_Generated at ${new Date().toLocaleTimeString('en-US')} UTC_`);
    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
