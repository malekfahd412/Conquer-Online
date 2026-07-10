import {
  ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ChannelType,
} from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { parseColor, resolveThemeColor } from './embed-themes';

export class SendStringSelectTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_string_select',
    description: 'Sends a message with a string (custom option) select menu to a channel. Options are defined as JSON.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        placeholder: { type: 'string', description: 'Placeholder text shown when nothing is selected' },
        options_json: {
          type: 'string',
          description: 'JSON array of options. Each: {label, value, description?, emoji?, default?}. Example: [{"label":"Category A","value":"cat_a","description":"Choose this for A"}]',
        },
        min_values: { type: 'string', description: 'Minimum selections required (default: 1)' },
        max_values: { type: 'string', description: 'Maximum selections allowed (default: 1)' },
        embed_title: { type: 'string', description: 'Optional embed title to show above the select' },
        embed_description: { type: 'string', description: 'Optional embed description' },
        embed_color: { type: 'string', description: 'Embed color (hex or theme name)' },
      },
      required: ['channel', 'options_json'],
    },
    dangerous: false,
    examples: ['Send a category select menu to #support with options: Bug Report, Feature Request, General Help'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let options: Array<{ label: string; value: string; description?: string; emoji?: string; default?: boolean }>;
    try {
      options = JSON.parse(String(params['options_json'] ?? '[]'));
      if (!Array.isArray(options) || options.length === 0) throw new Error('Must provide at least one option');
      if (options.length > 25) return { success: false, message: 'Maximum 25 options in a select menu' };
    } catch (err) {
      return { success: false, message: `Invalid options_json: ${(err as Error).message}` };
    }

    const minValues = Math.max(0, parseInt(String(params['min_values'] ?? '1')) || 1);
    const maxValues = Math.min(25, Math.max(1, parseInt(String(params['max_values'] ?? '1')) || 1));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`str_select_${Date.now()}`)
      .setPlaceholder(String(params['placeholder'] ?? 'Select an option'))
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(options.map(o => ({
        label: o.label.slice(0, 100),
        value: o.value.slice(0, 100),
        description: o.description?.slice(0, 100),
        emoji: o.emoji ?? undefined,
        default: o.default ?? false,
      })));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    const payload: Record<string, unknown> = { components: [row] };

    if (params['embed_title'] || params['embed_description']) {
      const colorInput = String(params['embed_color'] ?? '').trim();
      const color = colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput || 'modern');
      const embed = new EmbedBuilder().setColor(color);
      if (params['embed_title']) embed.setTitle(String(params['embed_title']).slice(0, 256));
      if (params['embed_description']) embed.setDescription(String(params['embed_description']).slice(0, 4096));
      payload['embeds'] = [embed];
    }

    const sent = await ch.send(payload as Parameters<TextChannel['send']>[0]);
    return {
      success: true,
      message: `✅ String select menu sent to **#${ch.name}** with **${options.length} option(s)** (message ID: \`${sent.id}\`)\n⚠️ Requires an interaction handler to process selections.`,
      data: { messageId: sent.id },
    };
  }
}
