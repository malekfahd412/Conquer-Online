import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendFaqPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_faq_panel',
    description: 'Sends a FAQ (Frequently Asked Questions) panel embed. Each Q&A pair becomes an embed field. Supports up to 25 questions.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the FAQ in' },
        title: { type: 'string', description: 'Panel title (default: "❓ Frequently Asked Questions")' },
        intro: { type: 'string', description: 'Introduction text shown before the Q&A list' },
        faq_json: {
          type: 'string',
          description: 'JSON array of Q&A pairs. Each: {q, a}. Example: [{"q":"How do I get started?","a":"Read the rules and verify yourself."}]',
        },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: info/blue)' },
        footer: { type: 'string', description: 'Footer text' },
        inline: { type: 'string', description: 'Set to "true" to display Q&As inline (side by side)' },
      },
      required: ['channel', 'faq_json'],
    },
    dangerous: false,
    examples: ['Post a FAQ panel in #faq with 5 common questions', 'Send FAQ to #help with questions about the game server'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let faqs: Array<{ q: string; a: string }>;
    try {
      faqs = JSON.parse(String(params['faq_json'] ?? '[]'));
      if (!Array.isArray(faqs) || faqs.length === 0) throw new Error('At least one Q&A pair required');
      if (faqs.length > 25) faqs = faqs.slice(0, 25);
    } catch (err) {
      return { success: false, message: `Invalid faq_json: ${(err as Error).message}` };
    }

    const isInline = String(params['inline'] ?? '').toLowerCase() === 'true';
    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0x3498db;

    const embed = new EmbedBuilder()
      .setTitle(String(params['title'] ?? '❓ Frequently Asked Questions'))
      .setColor(color)
      .setFooter({ text: String(params['footer'] ?? `${guild.name} • ${faqs.length} questions`) })
      .setTimestamp();

    if (params['intro']) embed.setDescription(String(params['intro']).slice(0, 1000));

    embed.setFields(faqs.map(({ q, a }) => ({
      name: `❓ ${q}`.slice(0, 256),
      value: `${a}`.slice(0, 1024),
      inline: isInline,
    })));

    const sent = await ch.send({ embeds: [embed] });
    return {
      success: true,
      message: `✅ FAQ panel with **${faqs.length} question(s)** sent to **#${ch.name}** (ID: \`${sent.id}\`)`,
      data: { messageId: sent.id },
    };
  }
}
