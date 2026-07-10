import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendApplicationsPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_applications_panel',
    description: 'Sends an applications/staff recruitment panel embed. Supports multiple application types (e.g. Moderator, Helper, Event Staff) as separate buttons.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to send the applications panel to' },
        title: { type: 'string', description: 'Panel title (default: "📝 Staff Applications")' },
        description: { type: 'string', description: 'Applications description and requirements overview' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: professional)' },
        thumbnail_url: { type: 'string', description: 'Optional thumbnail URL' },
        footer: { type: 'string', description: 'Footer text' },
        positions_json: {
          type: 'string',
          description: 'JSON array of position buttons. Each: {label, customId?, style?}. Example: [{"label":"🛡️ Moderator","customId":"apply_mod"},{"label":"🎉 Event Staff","customId":"apply_event"}]',
        },
        requirements: { type: 'string', description: 'General requirements text to include in the embed' },
        open: { type: 'string', description: 'Set to "false" to show applications as closed (disables buttons)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Send an applications panel to #apply with Moderator and Helper positions'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const isOpen = String(params['open'] ?? 'true').toLowerCase() !== 'false';
    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x2d3e50;

    const requirements = params['requirements'] ? String(params['requirements']) : '• Active server member\n• Clean moderation history\n• Available to dedicate time to the team';

    const defaultDescription = `**${guild.name}** is looking for dedicated members to join our team!\n\n**Requirements:**\n${requirements}\n\n${isOpen ? '✅ **Applications are currently OPEN!** Click a position below to apply.' : '❌ **Applications are currently CLOSED.** Check back later!'}`;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '📝 Staff Applications'))
      .setDescription(String(params['description'] ?? defaultDescription).slice(0, 4096))
      .setColor(isOpen ? color : 0xed4245)
      .setFooter({ text: String(params['footer'] ?? `${guild.name} Staff Team`) })
      .setTimestamp();

    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));

    let positions: Array<{ label: string; customId?: string; style?: string }> = [
      { label: '🛡️ Moderator', customId: 'apply_moderator' },
      { label: '🤝 Helper', customId: 'apply_helper' },
      { label: '🎉 Event Staff', customId: 'apply_event' },
    ];

    if (params['positions_json']) {
      try {
        const parsed = JSON.parse(String(params['positions_json']));
        if (Array.isArray(parsed) && parsed.length > 0) positions = parsed;
      } catch { /* use defaults */ }
    }

    const styleMap: Record<string, ButtonStyle> = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < Math.min(positions.length, 5); i += 5) {
      const chunk = positions.slice(i, i + 5);
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map(p => new ButtonBuilder()
          .setCustomId(p.customId ?? `apply_${p.label.replace(/\W+/g, '_').toLowerCase()}`)
          .setLabel(p.label)
          .setStyle(styleMap[p.style?.toLowerCase() ?? ''] ?? ButtonStyle.Primary)
          .setDisabled(!isOpen))
      ));
    }

    const sent = await ch.send({ embeds: [embed], components: rows });
    return {
      success: true,
      message: `✅ Applications panel sent to **#${ch.name}** with **${positions.length} position(s)** (ID: \`${sent.id}\`)\n⚠️ Apply buttons require interaction handlers to collect application responses.`,
      data: { messageId: sent.id },
    };
  }
}
