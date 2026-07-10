import { GuildScheduledEventStatus } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EndScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'end_scheduled_event',
    description: 'Ends (completes) an active scheduled event.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event to end' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['End the "Guild War" event'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    if (event.status !== GuildScheduledEventStatus.Active) {
      return { success: false, message: `Event **${event.name}** is not Active (current status: ${GuildScheduledEventStatus[event.status]})` };
    }

    await event.setStatus(GuildScheduledEventStatus.Completed);
    return { success: true, message: `Ended event **${event.name}** — marked Completed` };
  }
}
