import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  ChannelType,
} from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateScheduledEventTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_scheduled_event',
    description: 'Creates a scheduled guild event (voice stage, external, or voice channel event).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Event name' },
        description: { type: 'string', description: 'Event description (optional)' },
        startTime: { type: 'string', description: 'Start time in ISO 8601 format or natural format like "2025-12-25T18:00:00Z"' },
        endTime: { type: 'string', description: 'End time in ISO 8601 format (required for external events)' },
        location: { type: 'string', description: 'For external events: physical location. For voice events: voice channel name.' },
        type: { type: 'string', enum: ['external', 'voice'], description: 'Event type: external (physical location) or voice (in a voice channel)' },
      },
      required: ['name', 'startTime', 'type'],
    },
    dangerous: false,
    examples: ['Create a "Guild War" event in the Battle voice channel starting tomorrow at 8pm'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const type = String(params['type'] ?? 'external').toLowerCase();
    const location = params['location'] ? String(params['location']).trim() : null;

    if (!name) return { success: false, message: 'Event name is required' };

    let startTime: Date;
    try {
      startTime = new Date(String(params['startTime']));
      if (isNaN(startTime.getTime())) throw new Error('Invalid date');
    } catch {
      return { success: false, message: 'Invalid start time format. Use ISO 8601 (e.g. "2025-12-25T18:00:00Z")' };
    }

    if (startTime <= new Date()) {
      return { success: false, message: 'Start time must be in the future' };
    }

    let endTime: Date | undefined;
    if (params['endTime']) {
      try {
        endTime = new Date(String(params['endTime']));
        if (isNaN(endTime.getTime())) throw new Error('Invalid date');
      } catch {
        return { success: false, message: 'Invalid end time format' };
      }
    }

    if (type === 'voice') {
      if (!location) return { success: false, message: 'Voice channel name is required for voice events' };

      const voiceChannel = guild.channels.cache.find(
        c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
          && c.name.toLowerCase() === location.toLowerCase(),
      );

      if (!voiceChannel) return { success: false, message: `Voice channel "${location}" not found` };

      const isStage = voiceChannel.type === ChannelType.GuildStageVoice;

      const event = await guild.scheduledEvents.create({
        name,
        description: params['description'] ? String(params['description']) : undefined,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: isStage ? GuildScheduledEventEntityType.StageInstance : GuildScheduledEventEntityType.Voice,
        channel: voiceChannel.id,
      });

      return { success: true, message: `Created event **${event.name}** in **${voiceChannel.name}** starting <t:${Math.floor(startTime.getTime() / 1000)}:F>` };
    }

    // External event
    if (!location) return { success: false, message: 'Location is required for external events' };
    if (!endTime) return { success: false, message: 'End time is required for external events' };

    const event = await guild.scheduledEvents.create({
      name,
      description: params['description'] ? String(params['description']) : undefined,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location },
    });

    return { success: true, message: `Created external event **${event.name}** at "${location}" starting <t:${Math.floor(startTime.getTime() / 1000)}:F>` };
  }
}
