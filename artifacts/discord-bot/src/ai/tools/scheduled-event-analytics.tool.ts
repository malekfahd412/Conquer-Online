import { GuildScheduledEventStatus } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ScheduledEventAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'scheduled_event_analytics',
    description: 'Shows server-wide scheduled event statistics: counts by status and total interest.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show scheduled event analytics'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const events = await guild.scheduledEvents.fetch();
    if (events.size === 0) return { success: true, message: 'This server has no scheduled events to analyze' };

    const scheduled = events.filter(e => e.status === GuildScheduledEventStatus.Scheduled).size;
    const active = events.filter(e => e.status === GuildScheduledEventStatus.Active).size;
    const completed = events.filter(e => e.status === GuildScheduledEventStatus.Completed).size;
    const cancelled = events.filter(e => e.status === GuildScheduledEventStatus.Canceled).size;
    const totalInterest = events.reduce((sum, e) => sum + (e.userCount ?? 0), 0);

    const topByInterest = [...events.values()].sort((a, b) => (b.userCount ?? 0) - (a.userCount ?? 0)).slice(0, 3)
      .map((e, i) => `${i + 1}. **${e.name}** — ${e.userCount ?? 0} interested`);

    return {
      success: true,
      message: `**📊 Scheduled Event Analytics — ${guild.name}**\n• Total: ${events.size}\n• Scheduled: ${scheduled} | Active: ${active} | Completed: ${completed} | Cancelled: ${cancelled}\n• Total interest across all events: ${totalInterest}\n\n**Most interest:**\n${topByInterest.join('\n') || 'None'}`,
      data: { total: events.size, scheduled, active, completed, cancelled, totalInterest },
    };
  }
}
