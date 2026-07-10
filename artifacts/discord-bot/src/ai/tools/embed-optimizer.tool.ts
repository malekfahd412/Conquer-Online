import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EmbedOptimizerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'embed_optimizer',
    description: 'Analyzes an existing embed and provides concrete improvement suggestions for readability, structure, Discord limits, and visual design.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID of the embed to analyze' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Optimize the embed in #announcements message 123456'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let msg;
    try { msg = await ch.messages.fetch(messageId); } catch {
      return { success: false, message: `Message \`${messageId}\` not found` };
    }
    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds to analyze' };

    const e = msg.embeds[0];
    const suggestions: string[] = [];
    const strengths: string[] = [];

    // Color
    if (e.color == null) suggestions.push('🎨 **Add a color** — colorless embeds blend into the chat; pick a hex color that matches your server theme');
    else strengths.push('✅ Has a color');

    // Title
    if (!e.title) suggestions.push('📌 **Add a title** — titles give the embed a clear purpose and make it scannable');
    else if (e.title.length > 100) suggestions.push(`📌 **Shorten the title** (${e.title.length} chars) — titles over 100 chars can wrap awkwardly on mobile`);
    else strengths.push('✅ Good title');

    // Description
    if (!e.description && e.fields.length === 0) suggestions.push('📝 **Add a description or fields** — the embed body is empty');
    else if (e.description && e.description.length > 2000) suggestions.push(`📝 **Break up the description** (${e.description.length} chars) — long descriptions are hard to read; use fields instead`);
    else if (e.description) strengths.push('✅ Has description');

    // Footer
    if (!e.footer) suggestions.push('📎 **Add a footer** — footers are great for timestamps, source credits, or version info');
    else strengths.push('✅ Has footer');

    // Timestamp
    if (!e.timestamp) suggestions.push('🕐 **Add a timestamp** — shows when the embed was created/updated; useful for news and status embeds');
    else strengths.push('✅ Has timestamp');

    // Thumbnail
    if (!e.thumbnail && !e.image) suggestions.push('🖼️ **Add a thumbnail or image** — visual embeds get more engagement; use a server logo or relevant image');

    // Author
    if (!e.author) suggestions.push('👤 **Consider adding an author** — helps identify the source (e.g. bot name, staff member)');

    // Fields
    if (e.fields.length > 15) suggestions.push(`📋 **Reduce field count** (${e.fields.length}) — embeds with many fields can be overwhelming; consider splitting into multiple embeds`);

    const inlineCount = e.fields.filter(f => f.inline).length;
    const nonInlineCount = e.fields.length - inlineCount;
    if (e.fields.length >= 3 && inlineCount === 0) suggestions.push('📐 **Use inline fields** — for short key-value data, inline fields use space more efficiently (3 per row)');
    if (inlineCount > 0 && inlineCount % 3 !== 0 && nonInlineCount === 0) suggestions.push('📐 **Align inline fields** — rows of 3 look best; you currently have an uneven count');

    // Total chars
    const totalChars = [e.title, e.description, e.author?.name, e.footer?.text, ...e.fields.flatMap(f => [f.name, f.value])]
      .reduce((s, t) => s + (t?.length ?? 0), 0);
    if (totalChars > 4000) suggestions.push(`📏 **Reduce total content** (${totalChars}/6000 chars) — approaching the limit; remove or shorten verbose sections`);

    const lines = [
      `💡 **Embed Optimizer** — Message \`${messageId}\` in #${ch.name}`,
      `Total characters: **${totalChars}/6000**`,
      '',
    ];

    if (strengths.length) { lines.push('**What\'s good:**'); lines.push(...strengths); lines.push(''); }

    if (suggestions.length) {
      lines.push(`**${suggestions.length} suggestion(s):**`);
      lines.push(...suggestions.map((s, i) => `${i + 1}. ${s}`));
    } else {
      lines.push('🎉 This embed is well-optimized! No significant improvements found.');
    }

    return { success: true, message: lines.join('\n') };
  }
}
