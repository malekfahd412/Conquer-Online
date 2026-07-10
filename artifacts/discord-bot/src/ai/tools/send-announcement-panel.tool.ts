import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';
import { resolveVariables } from './embed-variables';

export class SendAnnouncementPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_announcement_panel',
    description: 'Sends a rich announcement embed with optional action buttons (Read More URL, Discord Invite, Website link). Supports variable resolution and themes.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the announcement in' },
        title: { type: 'string', description: 'Announcement title (required)' },
        description: { type: 'string', description: 'Announcement body — supports markdown and {guild.name}, {date} variables' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: modern/blurple)' },
        author_name: { type: 'string', description: 'Author name (e.g. "Staff Team", person name)' },
        footer: { type: 'string', description: 'Footer text' },
        thumbnail_url: { type: 'string', description: 'Thumbnail image URL' },
        image_url: { type: 'string', description: 'Banner image URL' },
        fields_json: { type: 'string', description: 'JSON array of additional fields: [{name,value,inline?}]' },
        read_more_url: { type: 'string', description: 'URL for a "Read More" link button' },
        ping_everyone: { type: 'string', description: 'Set to "true" to prepend @everyone to the message' },
        resolve_variables: { type: 'string', description: 'Set to "true" to resolve {guild.name}, {date}, etc.' },
      },
      required: ['channel', 'title'],
    },
    dangerous: false,
    examples: [
      'Send an announcement "Server Update v2.0" to #announcements',
      'Post an announcement in #news with a Read More button linking to the website',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const doResolve = String(params['resolve_variables'] ?? '').toLowerCase() === 'true';
    const resolve = (s: string) => doResolve ? resolveVariables(s, { guild }) : s;

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x5865f2;

    const embed = new EmbedBuilder()
      .setTitle(resolve(String(params['title'] ?? '')).slice(0, 256))
      .setColor(color)
      .setTimestamp();

    if (params['description']) embed.setDescription(resolve(String(params['description'])).slice(0, 4096));
    if (params['author_name']) embed.setAuthor({ name: resolve(String(params['author_name'])).slice(0, 256) });
    if (params['footer']) embed.setFooter({ text: resolve(String(params['footer'])).slice(0, 2048) });
    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));
    if (params['image_url']) embed.setImage(String(params['image_url']));

    if (params['fields_json']) {
      try {
        const fields = JSON.parse(String(params['fields_json'])) as Array<{ name: string; value: string; inline?: boolean }>;
        if (Array.isArray(fields) && fields.length > 0) {
          embed.setFields(fields.slice(0, 25).map(f => ({
            name: resolve(f.name).slice(0, 256),
            value: resolve(f.value).slice(0, 1024),
            inline: f.inline ?? false,
          })));
        }
      } catch { /* ignore malformed fields */ }
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const readMoreUrl = params['read_more_url'] ? String(params['read_more_url']) : null;
    if (readMoreUrl) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('📖 Read More').setStyle(ButtonStyle.Link).setURL(readMoreUrl),
      ));
    }

    const content = String(params['ping_everyone'] ?? '').toLowerCase() === 'true' ? '@everyone' : undefined;
    const sent = await ch.send({ content, embeds: [embed], components: rows });

    return {
      success: true,
      message: `✅ Announcement **"${params['title']}"** sent to **#${ch.name}** (ID: \`${sent.id}\`)`,
      data: { messageId: sent.id },
    };
  }
}
