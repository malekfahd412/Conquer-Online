import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendModerationPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_moderation_panel',
    description: 'Sends a moderation action panel embed with quick-action buttons (Warn, Timeout, Kick, Ban). Designed for mod-only channels. Buttons require interaction handlers.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Mod channel to send the panel to' },
        title: { type: 'string', description: 'Panel title (default: "⚠️ Moderation Panel")' },
        description: { type: 'string', description: 'Panel description' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: danger/red)' },
        footer: { type: 'string', description: 'Footer text' },
        show_stats: { type: 'string', description: 'Set to "true" to include live server stats (member count, ban count)' },
        include_links: { type: 'string', description: 'Set to "true" to include a View Audit Log link button' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send a moderation panel to #mod-tools', 'Create a mod panel in #admin with server stats'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0xed4245;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '⚠️ Moderation Panel'))
      .setDescription(String(params['description'] ?? `**${guild.name}** Moderation Center\n\nUse the buttons below to perform moderation actions. All actions are logged in the audit log.\n\n⚠️ **Use with care** — moderation actions affect real members.`).slice(0, 4096))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? `${guild.name} • Staff Only`) })
      .setTimestamp();

    if (String(params['show_stats'] ?? '').toLowerCase() === 'true') {
      let bans = 0;
      try { bans = (await guild.bans.fetch({ limit: 1000 })).size; } catch { bans = 0; }
      embed.addFields(
        { name: '👥 Members', value: String(guild.memberCount), inline: true },
        { name: '🔨 Bans', value: String(bans), inline: true },
        { name: '🛡️ Roles', value: String(guild.roles.cache.size), inline: true },
      );
    }

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('mod_warn').setLabel('⚠️ Warn').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mod_timeout').setLabel('⏰ Timeout').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mod_kick').setLabel('👢 Kick').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mod_ban').setLabel('🔨 Ban').setStyle(ButtonStyle.Danger),
    );
    const rows: ActionRowBuilder<ButtonBuilder>[] = [actionRow];

    const infoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('mod_check_warnings').setLabel('📋 Warnings').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mod_view_history').setLabel('📜 History').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mod_search_member').setLabel('🔍 Lookup').setStyle(ButtonStyle.Secondary),
    );
    rows.push(infoRow);

    const sent = await ch.send({ embeds: [embed], components: rows });
    return {
      success: true,
      message: `✅ Moderation panel sent to **#${ch.name}** (ID: \`${sent.id}\`)\n⚠️ All buttons require interaction handlers to execute moderation actions.`,
      data: { messageId: sent.id },
    };
  }
}
