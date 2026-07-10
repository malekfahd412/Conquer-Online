import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendTicketPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_ticket_panel',
    description: 'Sends a support ticket panel embed with an "Open Ticket" button. Clicking the button should trigger a ticket creation flow via an interaction handler.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the ticket panel in (e.g. #support)' },
        title: { type: 'string', description: 'Panel title (default: "🎫 Support Tickets")' },
        description: { type: 'string', description: 'Description explaining how to use tickets' },
        button_label: { type: 'string', description: 'Button label (default: "🎫 Open a Ticket")' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: blue/info)' },
        thumbnail_url: { type: 'string', description: 'Optional thumbnail URL' },
        footer: { type: 'string', description: 'Footer text' },
        show_categories: { type: 'string', description: 'Set to "true" to add category buttons (Bug Report, General Support, Billing)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send a ticket panel to #support', 'Create a ticket panel in #help with category buttons'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x3498db;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '🎫 Support Tickets'))
      .setDescription(String(params['description'] ?? `Need help? Our support team is here for you!\n\n**How it works:**\n1. Click the button below to open a ticket\n2. Describe your issue\n3. A staff member will assist you shortly\n\n📋 Please be patient — our team will respond as soon as possible.`))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? `${guild.name} Support`) })
      .setTimestamp();

    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));

    const showCategories = String(params['show_categories'] ?? '').toLowerCase() === 'true';
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (showCategories) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('ticket_bug').setLabel('🐛 Bug Report').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_support').setLabel('💬 General Support').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_billing').setLabel('💳 Billing').setStyle(ButtonStyle.Secondary),
      ));
    } else {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('open_ticket').setLabel(String(params['button_label'] ?? '🎫 Open a Ticket')).setStyle(ButtonStyle.Primary),
      ));
    }

    const sent = await ch.send({ embeds: [embed], components: rows });
    return {
      success: true,
      message: `✅ Ticket panel sent to **#${ch.name}** (ID: \`${sent.id}\`)\n⚠️ Ticket creation requires an interaction handler to open ticket channels on button click.`,
      data: { messageId: sent.id },
    };
  }
}
