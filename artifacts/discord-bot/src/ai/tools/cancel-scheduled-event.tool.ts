import { GuildScheduledEventStatus } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CancelScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cancel_scheduled_event',
    description: 'Cancels a scheduled event that has not started yet.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event to cancel' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Cancels the event for all subscribers. This cannot be undone.',
    examples: ['Cancel the "Guild War" event'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    if (event.status !== GuildScheduledEventStatus.Scheduled) {
      return { success: false, message: `Event **${event.name}** can only be cancelled while still Scheduled (current status: ${GuildScheduledEventStatus[event.status]})` };
    }

    await event.setStatus(GuildScheduledEventStatus.Canceled);
    return { success: true, message: `Cancelled event **${event.name}**` };
  }
}
