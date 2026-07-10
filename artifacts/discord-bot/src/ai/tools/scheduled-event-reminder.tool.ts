import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ScheduledEventReminderTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'scheduled_event_reminder',
    description: 'Posts a reminder message about a scheduled event to a text channel, pinging @here (Discord has no native per-event reminder scheduler, so this posts on demand).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the event to remind about' },
        channelName: { type: 'string', description: 'Channel to post the reminder in' },
        message: { type: 'string', description: 'Custom reminder text (optional — a default is generated if omitted)' },
      },
      required: ['name', 'channelName'],
    },
    dangerous: false,
    examples: ['Post a reminder for "Guild War" in #announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    if (!name || !channelName) return { success: false, message: 'Event name and channel name are required' };

    const events = await guild.scheduledEvents.fetch();
    const event = events.find(e => e.name.toLowerCase() === name);
    if (!event) return { success: false, message: `Scheduled event "${params['name']}" not found` };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const start = event.scheduledStartTimestamp ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:R>` : 'soon';
    const content = params['message']
      ? String(params['message'])
      : `@here ⏰ Reminder: **${event.name}** starts ${start}!${event.url ? `\n${event.url}` : ''}`;

    await channel.send({ content, allowedMentions: { parse: ['everyone'] } });
    return { success: true, message: `Posted a reminder for **${event.name}** in #${channel.name}` };
  }
}
