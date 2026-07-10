import { GuildScheduledEventPrivacyLevel } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DuplicateScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'duplicate_scheduled_event',
    description: 'Duplicates an existing scheduled event with a new start time (and optionally a new name).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event to duplicate' },
        newStartTime: { type: 'string', description: 'Start time for the duplicate, in ISO 8601 format' },
        newName: { type: 'string', description: 'Name for the duplicate (defaults to "<name> (Copy)")' },
      },
      required: ['name', 'newStartTime'],
    },
    dangerous: false,
    examples: ['Duplicate "Guild War" for next month'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };

    const newStartTime = new Date(String(params['newStartTime'] ?? ''));
    if (isNaN(newStartTime.getTime())) return { success: false, message: 'Invalid newStartTime format' };
    if (newStartTime <= new Date()) return { success: false, message: 'newStartTime must be in the future' };

    const events = await guild.scheduledEvents.fetch();
    const source = events.find(e => e.name.toLowerCase() === name);
    if (!source) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    const newName = params['newName'] ? String(params['newName']) : `${source.name} (Copy)`;
    let newEndTime: Date | undefined;
    if (source.scheduledStartTimestamp && source.scheduledEndTimestamp) {
      const durationMs = source.scheduledEndTimestamp - source.scheduledStartTimestamp;
      newEndTime = new Date(newStartTime.getTime() + durationMs);
    }

    const duplicate = await guild.scheduledEvents.create({
      name: newName,
      description: source.description ?? undefined,
      scheduledStartTime: newStartTime,
      scheduledEndTime: newEndTime,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: source.entityType,
      channel: source.channelId ?? undefined,
      entityMetadata: source.entityMetadata?.location ? { location: source.entityMetadata.location } : undefined,
      image: source.coverImageURL() ?? undefined,
    });

    return { success: true, message: `Duplicated event as **${duplicate.name}** starting <t:${Math.floor(newStartTime.getTime() / 1000)}:F>`, data: { id: duplicate.id } };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id } = (data as { id: string }) ?? {};
    const event = id ? await guild.scheduledEvents.fetch(id).catch(() => undefined) : undefined;
    if (!event) return { success: true, message: 'Duplicate already gone' };
    await event.delete();
    return { success: true, message: 'Rolled back — removed duplicated event' };
  }
}
