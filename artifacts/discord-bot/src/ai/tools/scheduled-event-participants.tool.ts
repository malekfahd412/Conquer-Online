import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ScheduledEventParticipantsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'scheduled_event_participants',
    description: 'Lists the users who marked interest ("Notify Me") in a scheduled event.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event' },
        limit: { type: 'string', description: 'Maximum number of participants to list (default 25, max 100)' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Who is interested in the "Guild War" event?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Event name is required' };
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '25'), 10) || 25));

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    const subscribers = await event.fetchSubscribers({ limit });
    if (subscribers.size === 0) return { success: true, message: `No one has marked interest in **${event.name}** yet` };

    const lines = subscribers.map(s => `• ${s.user.tag}`);
    return { success: true, message: `**👥 Participants — ${event.name} (${subscribers.size})**\n${lines.join('\n')}` };
  }
}
