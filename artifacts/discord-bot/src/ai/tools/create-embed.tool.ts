import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

function parseColor(color: string): number {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0x5865f2 : parsed;
}

export class CreateEmbedTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_embed',
    description: 'Creates and sends a professional embed message to a channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name to send the embed to' },
        title: { type: 'string', description: 'Embed title' },
        description: { type: 'string', description: 'Embed body text (supports markdown)' },
        color: { type: 'string', description: 'Embed color as hex (e.g. #5865F2) — optional' },
        footer: { type: 'string', description: 'Footer text — optional' },
        image_url: { type: 'string', description: 'URL of an image to display — optional' },
      },
      required: ['channel', 'title', 'description'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channel'] ?? '').trim().toLowerCase();
    const title = String(params['title'] ?? '').trim();
    const description = String(params['description'] ?? '').trim();

    if (!title) return { success: false, message: 'Embed title is required' };
    if (!description) return { success: false, message: 'Embed description is required' };

    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase() === channelName,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${params['channel']}" not found` };

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(params['color'] ? parseColor(String(params['color'])) : 0x5865f2)
      .setTimestamp();

    if (params['footer']) embed.setFooter({ text: String(params['footer']) });
    if (params['image_url']) embed.setImage(String(params['image_url']));

    await channel.send({ embeds: [embed] });
    return { success: true, message: `Sent embed **"${title}"** to **#${channel.name}**` };
  }
}
