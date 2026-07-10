import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType,
} from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { parseColor, resolveThemeColor } from './embed-themes';

const STYLE_MAP: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
  link: ButtonStyle.Link,
};

export class SendButtonPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_button_panel',
    description: 'Sends a message with an embed and up to 25 buttons arranged in rows (max 5 buttons per row, max 5 rows). Button styles: primary, secondary, success, danger, link. Link buttons open a URL; others require interaction handlers to function.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to send the panel to' },
        embed_title: { type: 'string', description: 'Embed title for the panel' },
        embed_description: { type: 'string', description: 'Embed body text' },
        embed_color: { type: 'string', description: 'Hex color or theme name' },
        buttons_json: {
          type: 'string',
          description: 'JSON array of button objects. Each: {label, style, url?, emoji?, disabled?}. Styles: primary|secondary|success|danger|link. Example: [{"label":"Join","style":"success"},{"label":"Website","style":"link","url":"https://example.com"}]',
        },
        buttons_per_row: { type: 'string', description: 'How many buttons per row (1–5, default: 5)' },
      },
      required: ['channel', 'buttons_json'],
    },
    dangerous: false,
    examples: [
      'Send a button panel to #verify with a "Verify" success button',
      'Send a support panel to #help with buttons: "Open Ticket" (primary), "FAQ" (secondary), "Website" (link)',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let buttonDefs: Array<{ label: string; style: string; url?: string; emoji?: string; disabled?: boolean; customId?: string }>;
    try {
      buttonDefs = JSON.parse(String(params['buttons_json'] ?? '[]'));
      if (!Array.isArray(buttonDefs) || buttonDefs.length === 0) throw new Error('buttons_json must be a non-empty array');
      if (buttonDefs.length > 25) return { success: false, message: 'Maximum 25 buttons per panel' };
    } catch (err) {
      return { success: false, message: `Invalid buttons_json: ${(err as Error).message}` };
    }

    const perRow = Math.min(5, Math.max(1, parseInt(String(params['buttons_per_row'] ?? '5')) || 5));
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let rowButtonCount = 0;

    for (const [i, def] of buttonDefs.entries()) {
      const style = STYLE_MAP[def.style?.toLowerCase() ?? 'primary'] ?? ButtonStyle.Primary;
      const btn = new ButtonBuilder().setLabel(def.label ?? 'Button').setStyle(style);

      if (style === ButtonStyle.Link) {
        if (!def.url) return { success: false, message: `Button ${i + 1} has style "link" but no url provided` };
        btn.setURL(def.url);
      } else {
        btn.setCustomId(def.customId ?? `btn_${i}_${Date.now()}`);
      }

      if (def.emoji) btn.setEmoji(def.emoji);
      if (def.disabled) btn.setDisabled(true);

      currentRow.addComponents(btn);
      rowButtonCount++;

      if (rowButtonCount >= perRow) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        rowButtonCount = 0;
      }
    }
    if (rowButtonCount > 0) rows.push(currentRow);
    if (rows.length > 5) return { success: false, message: 'Too many button rows (max 5). Reduce buttons_per_row or total buttons.' };

    const colorInput = String(params['embed_color'] ?? '').trim();
    const color = colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput || 'modern');

    const components: Record<string, unknown> = { components: rows };

    if (params['embed_title'] || params['embed_description']) {
      const embed = new EmbedBuilder().setColor(color).setTimestamp();
      if (params['embed_title']) embed.setTitle(String(params['embed_title']).slice(0, 256));
      if (params['embed_description']) embed.setDescription(String(params['embed_description']).slice(0, 4096));
      Object.assign(components, { embeds: [embed] });
    }

    const sent = await ch.send(components as Parameters<TextChannel['send']>[0]);
    return {
      success: true,
      message: `✅ Button panel sent to **#${ch.name}** with **${buttonDefs.length} button(s)** in **${rows.length} row(s)** (message ID: \`${sent.id}\`)\n⚠️ Non-link buttons require interaction handlers to respond to clicks.`,
      data: { messageId: sent.id, channelId: ch.id, buttonCount: buttonDefs.length },
    };
  }
}
