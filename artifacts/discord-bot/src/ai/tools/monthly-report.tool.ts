import { AuditLogEvent, ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { groupByJoinMonth } from './analytics-helpers';

export class MonthlyReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'monthly_report',
    description: 'Comprehensive monthly server report: member growth, moderation summary, channel and role counts, boost status, and year-to-date trends.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const membersThisMonth = guild.members.cache.filter(m => !m.user.bot && (m.joinedTimestamp ?? 0) >= monthAgo).size;

    const modEvents = [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove, AuditLogEvent.MessageDelete, AuditLogEvent.MessageBulkDelete, AuditLogEvent.MemberRoleUpdate];
    let totalMod = 0;
    const modBreakdown: Record<string, number> = {};
    for (const event of modEvents) {
      try {
        const logs = await guild.fetchAuditLogs({ type: event, limit: 50 });
        for (const entry of logs.entries.values()) {
          if (entry.createdTimestamp >= monthAgo) {
            const key = entry.action.toString().replace(/_/g, ' ').toLowerCase();
            modBreakdown[key] = (modBreakdown[key] ?? 0) + 1;
            totalMod++;
          }
        }
      } catch { /* skip */ }
    }

    const humans = guild.members.cache.filter(m => !m.user.bot);
    const byMonth = groupByJoinMonth([...humans.values()]);
    const allMonths = Object.entries(byMonth).slice(-6);

    const textChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;

    const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const lines = [
      `📋 **Monthly Report** — **${guild.name}**`,
      `📅 ${monthName}`,
      '',
      `**👥 Membership:**`,
      `Total: **${guild.memberCount}** | Joined this month: **${membersThisMonth}**`,
      `Boost tier: ${guild.premiumTier} | Boosts: ${guild.premiumSubscriptionCount ?? 0}`,
      '',
      `**📺 Server Structure:**`,
      `Text channels: ${textChs} | Voice: ${voiceChs} | Roles: ${guild.roles.cache.size} | Emojis: ${guild.emojis.cache.size}`,
      '',
      `**🛡️ Moderation (${totalMod} actions this month):**`,
    ];
    if (totalMod === 0) lines.push('  ✅ No moderation actions');
    else for (const [action, count] of Object.entries(modBreakdown)) lines.push(`  • ${action}: ${count}`);

    lines.push('', '**📈 Join Trend (last 6 months):**');
    for (const [month, count] of allMonths) lines.push(`  ${month}: **${count}** joined`);

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
