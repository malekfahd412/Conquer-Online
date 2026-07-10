import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkUnpinTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_unpin',
    description: 'Unpins multiple messages — specific IDs or ALL pinned messages in a channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_ids: { type: 'string', description: 'Comma-separated message IDs. Leave blank to unpin ALL pinned messages in the channel.' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Unpin all messages in #general', 'Unpin messages 111, 222 in announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const idsRaw = String(params['message_ids'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let success = 0; let failed = 0;

    if (!idsRaw) {
      const pinned = await ch.messages.fetchPinned();
      for (const msg of pinned.values()) {
        try { await msg.unpin(); success++; } catch { failed++; }
      }
    } else {
      const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean);
      for (const id of ids) {
        try { const msg = await ch.messages.fetch(id); await msg.unpin(); success++; } catch { failed++; }
      }
    }

    return { success: true, message: `**Bulk Unpin:** ${success} unpinned, ${failed} failed in **#${ch.name}**` };
  }
}
