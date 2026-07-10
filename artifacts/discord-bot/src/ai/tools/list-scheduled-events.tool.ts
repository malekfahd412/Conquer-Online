import { GuildScheduledEventStatus } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListScheduledEventsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_scheduled_events',
    description: 'Lists all scheduled events in the server with their status and start time.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['List all scheduled events', 'Show upcoming events'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const events = await guild.scheduledEvents.fetch();
    if (events.size === 0) return { success: true, message: 'This server has no scheduled events' };

    const lines = events.first(25).map(e => {
      const start = e.scheduledStartTimestamp ? `<t:${Math.floor(e.scheduledStartTimestamp / 1000)}:R>` : 'Unknown';
      return `• **${e.name}** — ${GuildScheduledEventStatus[e.status]}, starts ${start}, ${e.userCount ?? 0} interested`;
    });

    return { success: true, message: `**📅 Scheduled Events — ${guild.name} (${events.size})**\n${lines.join('\n')}` };
  }
}
