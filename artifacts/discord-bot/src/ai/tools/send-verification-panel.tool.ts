import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendVerificationPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_verification_panel',
    description: 'Sends a complete verification panel embed with a Verify button to a channel. Used to gate server access behind a button click.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to send the verification panel to' },
        title: { type: 'string', description: 'Panel title (default: "✅ Verification Required")' },
        description: { type: 'string', description: 'Panel body explaining what users need to do (default: generic verification message)' },
        button_label: { type: 'string', description: 'Verify button label (default: "✅ Verify Me")' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: success/green)' },
        thumbnail_url: { type: 'string', description: 'Optional thumbnail image URL (e.g. server logo)' },
        footer: { type: 'string', description: 'Footer text (default: server name)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send a verification panel to #verify', 'Create a verification panel in #get-access with a custom description'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x57f287;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '✅ Verification Required'))
      .setDescription(String(params['description'] ?? `Welcome to **${guild.name}**!\n\nTo gain access to the server, please click the **Verify Me** button below.\n\nBy verifying, you agree to follow our server rules and community guidelines.`))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? guild.name) })
      .setTimestamp();

    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));

    const button = new ButtonBuilder()
      .setCustomId('verify_user')
      .setLabel(String(params['button_label'] ?? '✅ Verify Me'))
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    const sent = await ch.send({ embeds: [embed], components: [row] });

    return {
      success: true,
      message: `✅ Verification panel sent to **#${ch.name}** (ID: \`${sent.id}\`)\n⚠️ The Verify button requires an interaction handler to grant roles on click.`,
      data: { messageId: sent.id },
    };
  }
}
