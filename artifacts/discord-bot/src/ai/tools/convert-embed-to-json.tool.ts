import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ConvertEmbedToJsonTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'convert_embed_to_json',
    description: 'Extracts the raw JSON structure from an embed in a message. Useful for copying, auditing, or re-importing embeds.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID containing the embed' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Export embed JSON from message 123456 in #announcements', 'Get the raw embed data from that message'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const msg = await ch.messages.fetch(messageId);
    if (msg.embeds.length === 0) return { success: false, message: 'Message has no embeds' };

    const embedData = msg.embeds.map(e => ({
      title: e.title,
      description: e.description,
      color: e.color,
      url: e.url,
      author: e.author,
      footer: e.footer,
      image: e.image?.url,
      thumbnail: e.thumbnail?.url,
      fields: e.fields,
      timestamp: e.timestamp,
    }));

    const json = JSON.stringify(embedData.length === 1 ? embedData[0] : embedData, null, 2);
    const truncated = json.length > 1800 ? json.slice(0, 1800) + '\n... (truncated)' : json;

    return { success: true, message: `**📋 Embed JSON from \`${messageId}\`:**\n\`\`\`json\n${truncated}\n\`\`\`` };
  }
}
