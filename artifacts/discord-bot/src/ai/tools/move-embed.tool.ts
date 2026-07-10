import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MoveEmbedTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'move_embed',
    description: 'Moves an embed from one channel to another by copying it to the target and deleting the original.',
    parameters: {
      type: 'object',
      properties: {
        source_channel: { type: 'string', description: 'Channel name or ID where the embed currently is' },
        message_id: { type: 'string', description: 'Message ID containing the embed' },
        target_channel: { type: 'string', description: 'Channel name or ID to move the embed to' },
        keep_original: { type: 'string', description: 'Set to "true" to keep the original message (makes it a copy, not a move)' },
      },
      required: ['source_channel', 'message_id', 'target_channel'],
    },
    dangerous: true,
    dangerDescription: 'Deletes the original embed message after copying it to the target channel.',
    examples: ['Move embed 123456 from #draft to #announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const srcQuery = String(params['source_channel'] ?? '').toLowerCase().trim();
    const dstQuery = String(params['target_channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const keepOriginal = String(params['keep_original'] ?? '').toLowerCase() === 'true';

    const findCh = (query: string) => guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === query || c.name.toLowerCase() === query),
    ) as TextChannel | undefined;

    const srcCh = findCh(srcQuery);
    if (!srcCh) return { success: false, message: `Source channel "${params['source_channel']}" not found` };

    const dstCh = findCh(dstQuery);
    if (!dstCh) return { success: false, message: `Target channel "${params['target_channel']}" not found` };

    let msg;
    try { msg = await srcCh.messages.fetch(messageId); } catch {
      return { success: false, message: `Message \`${messageId}\` not found in #${srcCh.name}` };
    }

    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds to move' };

    const embeds = msg.embeds.map(e => EmbedBuilder.from(e));
    const sent = await dstCh.send({ embeds });

    if (!keepOriginal) {
      try { await msg.delete(); } catch {
        return { success: true, message: `✅ Embed copied to **#${dstCh.name}** (ID: \`${sent.id}\`), but could not delete the original — missing Manage Messages permission` };
      }
    }

    const action = keepOriginal ? 'Copied' : 'Moved';
    return { success: true, message: `✅ ${action} embed to **#${dstCh.name}** (new message ID: \`${sent.id}\`)` };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const d = data as { targetChannelId?: string; newMessageId?: string };
    if (!d.targetChannelId || !d.newMessageId) return { success: false, message: 'No rollback data' };
    try {
      const ch = guild.channels.cache.get(d.targetChannelId) as TextChannel | undefined;
      if (!ch) return { success: false, message: 'Target channel no longer found' };
      const msg = await ch.messages.fetch(d.newMessageId);
      await msg.delete();
      return { success: true, message: 'Rollback: deleted the moved embed from target channel' };
    } catch {
      return { success: false, message: 'Rollback failed — message may already be deleted' };
    }
  }
}
