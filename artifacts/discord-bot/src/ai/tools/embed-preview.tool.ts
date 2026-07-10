import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { parseColor, resolveThemeColor, listThemes } from './embed-themes';
import { resolveVariables } from './embed-variables';

export class EmbedPreviewTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'embed_preview',
    description: 'Sends a preview of an embed to a channel with a "[PREVIEW]" label in the footer. Use this to review an embed before finalizing it. Supports themes and variable resolution.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to send the preview to' },
        title: { type: 'string', description: 'Embed title' },
        description: { type: 'string', description: 'Embed body text' },
        color: { type: 'string', description: 'Hex color (#5865F2) or theme name (dark, light, gaming, professional, minimal, modern, neon, gold, purple, pink, success, warning, danger, info)' },
        footer: { type: 'string', description: 'Footer text (a [PREVIEW] label will be appended)' },
        image_url: { type: 'string', description: 'Image URL' },
        thumbnail_url: { type: 'string', description: 'Thumbnail URL' },
        author_name: { type: 'string', description: 'Author name' },
        resolve_variables: { type: 'string', description: 'Set to "true" to resolve {guild.name}, {guild.members}, etc.' },
        list_themes: { type: 'string', description: 'Set to "true" to list available themes instead of sending a preview' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Preview a gaming-themed embed in #bot-testing with title "Server Update"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['list_themes'] ?? '').toLowerCase() === 'true') {
      return { success: true, message: `🎨 **Available Embed Themes:**\n\n${listThemes()}` };
    }

    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const doResolve = String(params['resolve_variables'] ?? '').toLowerCase() === 'true';
    const resolve = (s: string) => doResolve ? resolveVariables(s, { guild }) : s;

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const colorInput = String(params['color'] ?? '').trim();
    let color: number;
    if (colorInput.startsWith('#')) color = parseColor(colorInput);
    else if (colorInput) color = resolveThemeColor(colorInput);
    else color = 0x5865f2;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTimestamp();

    if (params['title']) embed.setTitle(resolve(String(params['title'])).slice(0, 256));
    if (params['description']) embed.setDescription(resolve(String(params['description'])).slice(0, 4096));
    if (params['image_url']) embed.setImage(String(params['image_url']));
    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));
    if (params['author_name']) embed.setAuthor({ name: resolve(String(params['author_name'])).slice(0, 256) });

    const footerBase = params['footer'] ? resolve(String(params['footer'])) : '';
    embed.setFooter({ text: `${footerBase ? footerBase + ' • ' : ''}[PREVIEW — not final]`.slice(0, 2048) });

    const sent = await ch.send({ embeds: [embed] });
    return {
      success: true,
      message: `✅ Preview sent to **#${ch.name}** (ID: \`${sent.id}\`)\nWhen satisfied, use \`edit_embed\` to remove the [PREVIEW] label or \`delete_message\` to discard it.`,
    };
  }
}
