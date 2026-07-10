import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { cancelScheduled, listScheduled } from './message-schedule-store';

export class CancelScheduledMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cancel_scheduled_message',
    description: 'Cancels a scheduled message by ID, or lists all pending scheduled messages in the server.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Scheduled message ID to cancel (from schedule_message or list). Leave blank to list all.' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Cancel scheduled message sm_123456_abc', 'List all scheduled messages'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const id = String(params['id'] ?? '').trim();

    if (!id) {
      const all = await listScheduled(guild.id);
      if (all.length === 0) return { success: true, message: 'No scheduled messages found.' };
      const lines = all.map(s => {
        const ch = guild.channels.cache.get(s.channelId);
        const chName = ch && 'name' in ch ? (ch as { name: string }).name : s.channelId;
        return `• \`${s.id}\` — <t:${Math.floor(s.sendAt / 1000)}:R> in **#${chName}** — "${s.content.slice(0, 50)}"`;
      });
      return { success: true, message: `**⏰ Scheduled Messages (${all.length}):**\n${lines.join('\n')}` };
    }

    const removed = await cancelScheduled(guild.id, id);
    if (!removed) return { success: false, message: `Scheduled message \`${id}\` not found` };
    return { success: true, message: `✅ Scheduled message \`${id}\` cancelled` };
  }
}
