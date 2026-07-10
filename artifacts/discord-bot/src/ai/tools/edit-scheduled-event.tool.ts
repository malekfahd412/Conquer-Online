import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EditScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_scheduled_event',
    description: 'Edits a scheduled event\'s name, description, start time, or end time.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current name of the event to edit' },
        newName: { type: 'string', description: 'New name (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        startTime: { type: 'string', description: 'New start time in ISO 8601 format (optional)' },
        endTime: { type: 'string', description: 'New end time in ISO 8601 format (optional)' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Change the start time of "Guild War" to next Friday at 8pm'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    const before = { name: event.name, description: event.description, startTime: event.scheduledStartTimestamp, endTime: event.scheduledEndTimestamp };

    const patch: Record<string, unknown> = {};
    if (params['newName']) patch.name = String(params['newName']);
    if (params['description']) patch.description = String(params['description']);
    if (params['startTime']) {
      const d = new Date(String(params['startTime']));
      if (isNaN(d.getTime())) return { success: false, message: 'Invalid start time format' };
      patch.scheduledStartTime = d;
    }
    if (params['endTime']) {
      const d = new Date(String(params['endTime']));
      if (isNaN(d.getTime())) return { success: false, message: 'Invalid end time format' };
      patch.scheduledEndTime = d;
    }

    if (Object.keys(patch).length === 0) return { success: false, message: 'Provide at least one field to change' };

    const updated = await event.edit(patch);
    return { success: true, message: `Updated scheduled event **${updated.name}**`, data: before };
  }

  async rollback(params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const before = data as { name: string; description: string | null; startTime: number | null; endTime: number | null };
    const newName = params['newName'] ? String(params['newName']) : String(params['name']);
    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === newName.toLowerCase());
    if (!event) return { success: false, message: 'Cannot roll back — event no longer exists' };
    await event.edit({
      name: before.name,
      description: before.description ?? undefined,
      scheduledStartTime: before.startTime ? new Date(before.startTime) : undefined,
      scheduledEndTime: before.endTime ? new Date(before.endTime) : undefined,
    });
    return { success: true, message: 'Rolled back — restored previous event details' };
  }
}
