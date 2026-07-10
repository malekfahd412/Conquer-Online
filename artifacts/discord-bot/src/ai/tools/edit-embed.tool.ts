import { EmbedBuilder, ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { parseColor } from './embed-themes';

export class EditEmbedTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_embed',
    description: 'Edits an existing embed message sent by the bot. Specify which fields to change; omitted fields are kept as-is.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID containing the embed message' },
        message_id: { type: 'string', description: 'Message ID of the embed to edit' },
        title: { type: 'string', description: 'New title (leave blank to keep current)' },
        description: { type: 'string', description: 'New description/body text (leave blank to keep current)' },
        color: { type: 'string', description: 'New hex color e.g. #FF5733 (leave blank to keep current)' },
        footer: { type: 'string', description: 'New footer text (leave blank to keep current)' },
        image_url: { type: 'string', description: 'New image URL (leave blank to keep current)' },
        thumbnail_url: { type: 'string', description: 'New thumbnail URL (leave blank to keep current)' },
        author_name: { type: 'string', description: 'New author name (leave blank to keep current)' },
        clear_fields: { type: 'string', description: 'Set to "true" to remove all fields from the embed' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Edit the embed in #announcements message 123456 — change title to "New Title"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    if (!messageId) return { success: false, message: 'message_id is required' };

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let msg;
    try {
      msg = await ch.messages.fetch(messageId);
    } catch {
      return { success: false, message: `Message \`${messageId}\` not found in #${ch.name}` };
    }

    if (!msg.editable) return { success: false, message: 'Cannot edit this message — it was not sent by the bot' };
    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds to edit' };

    const original = msg.embeds[0];
    const embed = EmbedBuilder.from(original);

    if (params['title']) embed.setTitle(String(params['title']));
    if (params['description']) embed.setDescription(String(params['description']));
    if (params['color']) embed.setColor(parseColor(String(params['color'])));
    if (params['footer']) embed.setFooter({ text: String(params['footer']) });
    if (params['image_url']) embed.setImage(String(params['image_url']));
    if (params['thumbnail_url']) embed.setThumbnail(String(params['thumbnail_url']));
    if (params['author_name']) embed.setAuthor({ name: String(params['author_name']) });
    if (String(params['clear_fields'] ?? '').toLowerCase() === 'true') embed.setFields([]);

    await msg.edit({ embeds: [embed] });
    return { success: true, message: `✅ Embed in **#${ch.name}** (\`${messageId}\`) updated successfully` };
  }
}
