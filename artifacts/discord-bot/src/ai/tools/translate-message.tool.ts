import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { aiTransform } from './ai-text-helper';

export class TranslateMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'translate_message',
    description: 'Translates a message from a channel to a specified language using AI, then posts the translation as a reply or new message.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID to translate' },
        language: { type: 'string', description: 'Target language (e.g. Spanish, French, Arabic, Chinese)' },
        post_result: { type: 'string', description: 'Post translation to the channel (true/false, default true)' },
      },
      required: ['channel', 'message_id', 'language'],
    },
    dangerous: false,
    examples: ['Translate message 123456 in #general to Spanish', 'Translate this message to Arabic and post it'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const language = String(params['language'] ?? 'English').trim();
    const postResult = String(params['post_result'] ?? 'true') !== 'false';

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const msg = await ch.messages.fetch(messageId);
    if (!msg.content) return { success: false, message: 'Message has no text content to translate' };

    const translated = await aiTransform(`Translate the following text to ${language}. Preserve tone and meaning.`, msg.content);

    if (postResult) {
      await ch.send(`🌐 **Translation to ${language}** (from ${msg.author.username}):\n> ${translated}`);
    }

    return { success: true, message: `✅ Translation to **${language}**:\n${translated}` };
  }
}
