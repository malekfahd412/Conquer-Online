import type { Guild, TextChannel } from 'discord.js';
import { ChannelType, EmbedBuilder } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ConvertToEmbedTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'convert_to_embed',
    description: 'Converts a plain text message into a formatted embed and reposts it. Optionally deletes the original message.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID to convert' },
        title: { type: 'string', description: 'Embed title (optional)' },
        color: { type: 'string', description: 'Hex color for embed (e.g. #5865F2, default blue)' },
        delete_original: { type: 'string', description: 'Delete the original message after conversion (true/false, default false)' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Convert message 123456 in #announcements to an embed', 'Turn that plain message into a nice embed with title "Update"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const title = String(params['title'] ?? '').trim() || undefined;
    const colorRaw = String(params['color'] ?? '#5865F2').replace('#', '');
    const color = parseInt(colorRaw, 16) || 0x5865f2;
    const deleteOriginal = String(params['delete_original'] ?? 'false') === 'true';

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const msg = await ch.messages.fetch(messageId);
    if (!msg.content) return { success: false, message: 'Message has no text content to convert' };

    const embed = new EmbedBuilder()
      .setDescription(msg.content)
      .setColor(color)
      .setFooter({ text: `Originally by ${msg.author.username}`, iconURL: msg.author.displayAvatarURL() })
      .setTimestamp(msg.createdAt);
    if (title) embed.setTitle(title);

    await ch.send({ embeds: [embed] });
    if (deleteOriginal) {
      try { await msg.delete(); } catch { /* insufficient permissions */ }
    }

    return { success: true, message: `✅ Message converted to embed in **#${ch.name}**${deleteOriginal ? ' (original deleted)' : ''}` };
  }
}
