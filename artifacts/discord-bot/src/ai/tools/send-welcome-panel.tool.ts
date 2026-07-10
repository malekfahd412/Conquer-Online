import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';
import { resolveVariables } from './embed-variables';

export class SendWelcomePanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_welcome_panel',
    description: 'Sends a welcome panel embed to a channel. Supports variable resolution ({guild.name}, {guild.members}, etc.) and optional action buttons (Rules, Roles, Support).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to send the welcome panel to' },
        title: { type: 'string', description: 'Panel title (default: "👋 Welcome to {guild.name}!")' },
        description: { type: 'string', description: 'Welcome message body. Supports {guild.name}, {guild.members}, {guild.boosts}, {date}' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: purple)' },
        thumbnail_url: { type: 'string', description: 'Thumbnail URL (e.g. server icon). Leave blank to use server icon.' },
        image_url: { type: 'string', description: 'Banner image URL' },
        footer: { type: 'string', description: 'Footer text' },
        show_buttons: { type: 'string', description: 'Set to "true" to add quick navigation buttons (📜 Rules, 🎭 Get Roles, 💬 Support)' },
        rules_channel: { type: 'string', description: 'Rules channel name for the Rules button link (requires show_buttons=true)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send a welcome panel to #welcome', 'Create welcome panel with server stats and navigation buttons'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const ctx = { guild };
    const resolve = (s: string) => resolveVariables(s, ctx);

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x9b59b6;

    const defaultDescription = `We're thrilled to have you here in **{guild.name}**! 🎉\n\nWe currently have **{guild.members} members** and **{guild.boosts} boosts**.\n\n**Getting Started:**\n📜 Read the rules and verify yourself\n🎭 Grab some roles to customize your experience\n💬 Introduce yourself and say hi!\n\nWelcome aboard — we hope you enjoy your stay!`;

    const embed = new EmbedBuilder()
      .setTitle(resolve(String(params['title'] ?? '👋 Welcome to {guild.name}!')))
      .setDescription(resolve(String(params['description'] ?? defaultDescription)).slice(0, 4096))
      .setColor(color)
      .setFooter({ text: resolve(String(params['footer'] ?? '{guild.name} • {date}')) })
      .setTimestamp();

    const thumbnailUrl = params['thumbnail_url'] ? String(params['thumbnail_url']) : (guild.iconURL({ size: 256 }) ?? undefined);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (params['image_url']) embed.setImage(String(params['image_url']));

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (String(params['show_buttons'] ?? '').toLowerCase() === 'true') {
      const buttons = [
        new ButtonBuilder().setCustomId('goto_rules').setLabel('📜 Rules').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('goto_roles').setLabel('🎭 Get Roles').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('goto_support').setLabel('💬 Support').setStyle(ButtonStyle.Secondary),
      ];
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
    }

    const sent = await ch.send({ embeds: [embed], components });
    return {
      success: true,
      message: `✅ Welcome panel sent to **#${ch.name}** (ID: \`${sent.id}\`)`,
      data: { messageId: sent.id },
    };
  }
}
