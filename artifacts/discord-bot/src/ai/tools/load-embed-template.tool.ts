import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getTemplate } from './embed-store';
import { resolveThemeColor, parseColor } from './embed-themes';
import { resolveVariables } from './embed-variables';

export class LoadEmbedTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'load_embed_template',
    description: 'Loads a saved embed template by name and sends it to a channel. Supports variable resolution and theme overrides.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name to load' },
        channel: { type: 'string', description: 'Channel to send the embed to' },
        resolve_variables: { type: 'string', description: 'Set to "true" to resolve {guild.name}, {member.name}, etc.' },
        color_override: { type: 'string', description: 'Override the template color (hex or theme name)' },
        title_override: { type: 'string', description: 'Override the template title' },
        footer_override: { type: 'string', description: 'Override the template footer' },
      },
      required: ['name', 'channel'],
    },
    dangerous: false,
    examples: ['Load template "welcome" and send it to #welcome-channel', 'Send the "announcement" template to #news with gaming theme'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const doResolve = String(params['resolve_variables'] ?? '').toLowerCase() === 'true';
    const resolve = (s: string) => doResolve ? resolveVariables(s, { guild }) : s;

    const template = await getTemplate(name);
    if (!template) return { success: false, message: `Template "${name}" not found. Use \`list_embed_templates\` to see available templates.` };

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const d = template.data;
    const embed = new EmbedBuilder();

    // Color
    let color = d.color ?? 0x5865f2;
    if (params['color_override']) {
      const co = String(params['color_override']);
      color = co.startsWith('#') ? parseColor(co) : resolveThemeColor(co, color);
    } else if (template.theme) {
      color = resolveThemeColor(template.theme, color);
    }
    embed.setColor(color);

    if (params['title_override']) embed.setTitle(resolve(String(params['title_override'])).slice(0, 256));
    else if (d.title) embed.setTitle(resolve(d.title).slice(0, 256));

    if (d.description) embed.setDescription(resolve(d.description).slice(0, 4096));
    if (d.url) embed.setURL(d.url);
    if (d.timestamp) embed.setTimestamp();

    if (d.author) embed.setAuthor({ name: resolve(d.author.name).slice(0, 256), url: d.author.url, iconURL: d.author.iconURL });

    const footerText = params['footer_override'] ? String(params['footer_override']) : d.footer?.text;
    if (footerText) embed.setFooter({ text: resolve(footerText).slice(0, 2048), iconURL: d.footer?.iconURL });

    if (d.image) embed.setImage(d.image);
    if (d.thumbnail) embed.setThumbnail(d.thumbnail);

    if (d.fields && d.fields.length > 0) {
      embed.setFields(d.fields.slice(0, 25).map(f => ({
        name: resolve(f.name).slice(0, 256),
        value: resolve(f.value).slice(0, 1024),
        inline: f.inline,
      })));
    }

    const sent = await ch.send({ embeds: [embed] });
    return {
      success: true,
      message: `✅ Template **"${template.name}"** sent to **#${ch.name}** (message ID: \`${sent.id}\`)`,
      data: { messageId: sent.id, channelId: ch.id },
    };
  }
}
