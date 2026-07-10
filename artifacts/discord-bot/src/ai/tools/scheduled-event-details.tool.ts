import { GuildScheduledEventStatus } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ScheduledEventDetailsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'scheduled_event_details',
    description: 'Shows full details for a specific scheduled event: description, location/channel, times, status, and interest count.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event to inspect' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Show details for the "Guild War" event'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    const start = event.scheduledStartTimestamp ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>` : 'Unknown';
    const end = event.scheduledEndTimestamp ? `<t:${Math.floor(event.scheduledEndTimestamp / 1000)}:F>` : 'Not set';
    const location = event.entityMetadata?.location ?? (event.channel ? `#${event.channel.name}` : 'Unknown');

    return {
      success: true,
      message: `**📅 ${event.name}**\n• Status: ${GuildScheduledEventStatus[event.status]}\n• Description: ${event.description ?? 'None'}\n• Location: ${location}\n• Start: ${start}\n• End: ${end}\n• Interested: ${event.userCount ?? 0}\n• Creator: ${event.creator?.tag ?? 'Unknown'}`,
      data: { id: event.id, status: event.status, userCount: event.userCount },
    };
  }
}
