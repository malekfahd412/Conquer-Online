import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkPinTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_pin',
    description: 'Pins multiple messages in a channel by providing a list of message IDs.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_ids: { type: 'string', description: 'Comma-separated message IDs to pin' },
      },
      required: ['channel', 'message_ids'],
    },
    dangerous: false,
    examples: ['Pin messages 111, 222, 333 in #resources', 'Bulk pin these message IDs in announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const idsRaw = String(params['message_ids'] ?? '');
    const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return { success: false, message: 'At least one message ID is required' };

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let success = 0; let failed = 0;
    for (const id of ids) {
      try {
        const msg = await ch.messages.fetch(id);
        await msg.pin();
        success++;
      } catch { failed++; }
    }

    return { success: true, message: `**Bulk Pin:** ${success} pinned, ${failed} failed in **#${ch.name}**\n⚠️ Discord allows max 50 pins per channel.` };
  }
}
