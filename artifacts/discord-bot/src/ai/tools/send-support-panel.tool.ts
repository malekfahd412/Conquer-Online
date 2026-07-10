import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendSupportPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_support_panel',
    description: 'Sends a comprehensive support hub panel with multiple action buttons: Open Ticket, Check FAQ, and optional external links (website, documentation).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the support panel in' },
        title: { type: 'string', description: 'Panel title (default: "🛠️ Support Center")' },
        description: { type: 'string', description: 'Support panel description' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: info/blue)' },
        thumbnail_url: { type: 'string', description: 'Optional thumbnail URL' },
        footer: { type: 'string', description: 'Footer text' },
        website_url: { type: 'string', description: 'Website URL for a link button' },
        docs_url: { type: 'string', description: 'Documentation URL for a link button' },
        response_time: { type: 'string', description: 'Expected response time (e.g. "within 24 hours")' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send a support panel to #support with website and docs links'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const responseTime = String(params['response_time'] ?? 'within 24 hours');
    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x3498db;

    const defaultDescription = `Welcome to the **${guild.name}** Support Center!\n\nOur team is here to help you with any questions or issues.\n\n**📋 Before opening a ticket:**\n• Check the FAQ — your question may already be answered\n• Search previous announcements\n• Read the documentation\n\n⏱️ **Response time:** ${responseTime}`;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '🛠️ Support Center'))
      .setDescription(String(params['description'] ?? defaultDescription).slice(0, 4096))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? `${guild.name} Support`) })
      .setTimestamp();

    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));

    const mainButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Open Ticket').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('view_faq').setLabel('📋 FAQ').setStyle(ButtonStyle.Secondary),
    );
    const rows: ActionRowBuilder<ButtonBuilder>[] = [mainButtons];

    const linkButtons: ButtonBuilder[] = [];
    if (params['website_url']) linkButtons.push(new ButtonBuilder().setLabel('🌐 Website').setStyle(ButtonStyle.Link).setURL(String(params['website_url'])));
    if (params['docs_url']) linkButtons.push(new ButtonBuilder().setLabel('📚 Docs').setStyle(ButtonStyle.Link).setURL(String(params['docs_url'])));
    if (linkButtons.length > 0) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...linkButtons));

    const sent = await ch.send({ embeds: [embed], components: rows });
    return {
      success: true,
      message: `✅ Support panel sent to **#${ch.name}** (ID: \`${sent.id}\`)\n⚠️ Ticket and FAQ buttons require interaction handlers.`,
      data: { messageId: sent.id },
    };
  }
}
