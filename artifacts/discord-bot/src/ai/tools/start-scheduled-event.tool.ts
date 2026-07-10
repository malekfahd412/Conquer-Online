import { GuildScheduledEventStatus } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class StartScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'start_scheduled_event',
    description: 'Starts a scheduled event immediately, marking it Active. Discord only allows starting an event once its scheduled start time has arrived.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event to start' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Start the "Guild War" event now'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    if (event.status !== GuildScheduledEventStatus.Scheduled) {
      return { success: false, message: `Event **${event.name}** is not in a startable state (current status: ${GuildScheduledEventStatus[event.status]})` };
    }

    await event.setStatus(GuildScheduledEventStatus.Active);
    return { success: true, message: `Started event **${event.name}** — now Active` };
  }
}
