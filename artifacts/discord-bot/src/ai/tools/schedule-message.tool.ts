import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { scheduleMessage } from './message-schedule-store';

export class ScheduleMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'schedule_message',
    description: 'Schedules a text message to be sent in a channel at a specified future time (ISO datetime or relative like "in 2 hours").',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        content: { type: 'string', description: 'Message content to send' },
        send_at: { type: 'string', description: 'When to send: ISO datetime (e.g. 2025-12-31T20:00:00Z) or relative like "in 2 hours", "in 30 minutes"' },
      },
      required: ['channel', 'content', 'send_at'],
    },
    dangerous: false,
    examples: ['Schedule "Happy New Year!" in #general for 2025-12-31T23:59:00Z', 'Send announcement in 2 hours'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const content = String(params['content'] ?? '').trim();
    const sendAtRaw = String(params['send_at'] ?? '').trim();
    if (!content) return { success: false, message: 'Message content is required' };

    const ch = guild.channels.cache.find(c =>
      c.isTextBased() && (c.id === chQuery || ('name' in c && (c.name as string).toLowerCase() === chQuery)),
    );
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let sendAt: number;
    const relMatch = sendAtRaw.match(/in\s+(\d+)\s+(minute|hour|day|second)s?/i);
    if (relMatch) {
      const num = parseInt(relMatch[1] ?? '0', 10);
      const unit = (relMatch[2] ?? 'minute').toLowerCase();
      const mult: Record<string, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
      sendAt = Date.now() + num * (mult[unit] ?? 60000);
    } else {
      sendAt = new Date(sendAtRaw).getTime();
      if (isNaN(sendAt)) return { success: false, message: `Invalid time format. Use ISO datetime or "in 2 hours"` };
    }

    if (sendAt <= Date.now()) return { success: false, message: 'Scheduled time must be in the future' };
    if (sendAt > Date.now() + 30 * 24 * 60 * 60 * 1000) return { success: false, message: 'Cannot schedule more than 30 days ahead' };

    const scheduled = await scheduleMessage({
      guildId: guild.id,
      channelId: ch.id,
      content,
      sendAt,
    }, guild.client);

    const ts = Math.floor(sendAt / 1000);
    return {
      success: true,
      message: `⏰ Message scheduled!\n• ID: \`${scheduled.id}\`\n• Channel: **#${ch.isTextBased() && 'name' in ch ? ch.name : ch.id}**\n• Sends: <t:${ts}:F> (<t:${ts}:R>)\n• Preview: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`,
    };
  }
}
