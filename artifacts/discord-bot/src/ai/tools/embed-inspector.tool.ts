import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EmbedInspectorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'embed_inspector',
    description: 'Inspects and reports every property of an embed in a message: title, description, color, author, footer, image, thumbnail, fields, and character counts.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID containing the message' },
        message_id: { type: 'string', description: 'Message ID to inspect' },
        embed_index: { type: 'string', description: 'Which embed to inspect if message has multiple (0-based, default: 0)' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Inspect the embed in #announcements message 123456'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const idx = Math.max(0, parseInt(String(params['embed_index'] ?? '0')) || 0);

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let msg;
    try { msg = await ch.messages.fetch(messageId); } catch {
      return { success: false, message: `Message \`${messageId}\` not found` };
    }

    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds' };
    if (idx >= msg.embeds.length) return { success: false, message: `Embed index ${idx} out of range (message has ${msg.embeds.length} embed(s))` };

    const e = msg.embeds[idx];
    let totalChars = 0;
    const count = (s: string | null | undefined) => { totalChars += (s?.length ?? 0); return s?.length ?? 0; };

    const lines: string[] = [
      `📋 **Embed Inspector** — Message \`${messageId}\` (embed ${idx + 1}/${msg.embeds.length})`,
      `**Channel:** #${ch.name}`,
      `**Bot message:** ${msg.author?.bot ? 'Yes' : 'No'} | **Editable:** ${msg.editable ? 'Yes' : 'No'}`,
      '',
      `**Title:** ${e.title ? `"${e.title}" (${count(e.title)} chars)` : '_none_'}`,
      `**Description:** ${e.description ? `${count(e.description)} chars` : '_none_'}`,
      `**Color:** ${e.color != null ? `#${e.color.toString(16).padStart(6, '0').toUpperCase()}` : '_none_'}`,
      `**URL:** ${e.url ?? '_none_'}`,
      `**Timestamp:** ${e.timestamp ?? '_none_'}`,
      `**Author:** ${e.author ? `"${e.author.name}" (${count(e.author.name)} chars)${e.author.url ? ` | URL: ${e.author.url}` : ''}${e.author.iconURL ? ' | has icon' : ''}` : '_none_'}`,
      `**Footer:** ${e.footer ? `"${e.footer.text}" (${count(e.footer.text)} chars)${e.footer.iconURL ? ' | has icon' : ''}` : '_none_'}`,
      `**Image:** ${e.image ? e.image.url : '_none_'}`,
      `**Thumbnail:** ${e.thumbnail ? e.thumbnail.url : '_none_'}`,
      `**Fields (${e.fields.length}/25):**`,
    ];

    for (const [i, f] of e.fields.entries()) {
      count(f.name); count(f.value);
      lines.push(`  ${i + 1}. "${f.name}" (${f.name.length}c) → ${f.value.length} chars${f.inline ? ' [inline]' : ''}`);
    }

    if (e.description) count(e.description);
    lines.push('');
    lines.push(`**Total characters:** ${totalChars}/6000 (${Math.round((totalChars / 6000) * 100)}% of limit)`);

    return { success: true, message: lines.join('\n') };
  }
}
