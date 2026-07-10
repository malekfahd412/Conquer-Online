import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { resolveThemeColor, parseColor } from './embed-themes';

export class SendGiveawayPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_giveaway_panel',
    description: 'Sends a giveaway announcement embed with an "Enter Giveaway" button. Includes prize, winner count, end time, and requirements.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to post the giveaway in' },
        prize: { type: 'string', description: 'What is being given away (required)' },
        winners: { type: 'string', description: 'Number of winners (default: 1)' },
        ends_in: { type: 'string', description: 'When the giveaway ends (e.g. "24 hours", "7 days", "Dec 25")' },
        requirements: { type: 'string', description: 'Entry requirements (e.g. "Must be level 5+", "Verified members only")' },
        hosted_by: { type: 'string', description: 'Who is hosting the giveaway' },
        color: { type: 'string', description: 'Embed color (hex or theme name, default: gold)' },
        image_url: { type: 'string', description: 'Optional banner image' },
        button_label: { type: 'string', description: 'Button label (default: "🎉 Enter Giveaway")' },
      },
      required: ['channel', 'prize'],
    },
    dangerous: false,
    examples: ['Start a giveaway in #giveaways for "1 Month Discord Nitro" ending in 48 hours with 3 winners'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const prize = String(params['prize'] ?? '').trim();
    if (!prize) return { success: false, message: 'prize is required' };

    const winners = String(params['winners'] ?? '1');
    const endsIn = String(params['ends_in'] ?? 'TBD');
    const requirements = params['requirements'] ? String(params['requirements']) : 'None — open to all members';
    const hostedBy = params['hosted_by'] ? String(params['hosted_by']) : guild.name;

    const colorInput = String(params['color'] ?? '').trim();
    const color = colorInput ? (colorInput.startsWith('#') ? parseColor(colorInput) : resolveThemeColor(colorInput)) : 0xf1c40f;

    const embed = new EmbedBuilder()
      .setTitle('🎉 GIVEAWAY 🎉')
      .setDescription(`**Prize:** ${prize}`)
      .setColor(color)
      .setTimestamp()
      .addFields(
        { name: '🏆 Winners', value: winners, inline: true },
        { name: '⏰ Ends', value: endsIn, inline: true },
        { name: '👤 Hosted By', value: hostedBy, inline: true },
        { name: '📋 Requirements', value: requirements, inline: false },
        { name: '📌 How to Enter', value: 'Click the **Enter Giveaway** button below!', inline: false },
      )
      .setFooter({ text: `${guild.name} Giveaways • ${parseInt(winners) > 1 ? `${winners} winners` : '1 winner'}` });

    if (params['image_url']) embed.setImage(String(params['image_url']));

    const button = new ButtonBuilder()
      .setCustomId('enter_giveaway')
      .setLabel(String(params['button_label'] ?? '🎉 Enter Giveaway'))
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    const sent = await ch.send({ embeds: [embed], components: [row] });

    return {
      success: true,
      message: `✅ Giveaway panel for **"${prize}"** sent to **#${ch.name}** (ID: \`${sent.id}\`)\n⚠️ Entry tracking requires an interaction handler for the Enter button.`,
      data: { messageId: sent.id },
    };
  }
}
