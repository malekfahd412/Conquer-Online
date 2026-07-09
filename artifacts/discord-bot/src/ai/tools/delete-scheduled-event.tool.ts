import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_scheduled_event',
    description: 'Deletes a scheduled guild event by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the scheduled event to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the scheduled event.',
    examples: ['Delete the "Guild War" event'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);

    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    await event.delete();
    return { success: true, message: `Deleted scheduled event **${event.name}**` };
  }
}
