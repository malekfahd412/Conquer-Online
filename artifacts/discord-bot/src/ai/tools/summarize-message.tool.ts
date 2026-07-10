import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { aiTransform } from './ai-text-helper';

export class SummarizeMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'summarize_message',
    description: 'Summarizes a long message or recent channel conversation into key points using AI.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Specific message ID to summarize (leave blank to summarize the last 20 messages in the channel)' },
        post_result: { type: 'string', description: 'Post summary to the channel (true/false, default false)' },
      },
      required: ['channel'],
    },
    dangerous: false,
    examples: ['Summarize the last 20 messages in #general', 'Summarize message 123456 in #announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const postResult = String(params['post_result'] ?? 'false') === 'true';

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    let textToSummarize: string;

    if (messageId) {
      const msg = await ch.messages.fetch(messageId);
      if (!msg.content) return { success: false, message: 'Message has no text content' };
      textToSummarize = msg.content;
    } else {
      const messages = await ch.messages.fetch({ limit: 20 });
      const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      textToSummarize = sorted.map(m => `${m.author.username}: ${m.content}`).filter(l => l.includes(': ') && l.length > 10).join('\n');
      if (!textToSummarize) return { success: false, message: 'No readable messages found to summarize' };
    }

    const summary = await aiTransform('Summarize the following text or conversation in 3-5 concise bullet points. Focus on the key information and decisions.', textToSummarize);

    if (postResult) {
      await ch.send(`📋 **Channel Summary:**\n${summary}`);
    }

    return { success: true, message: `📋 **Summary:**\n${summary}` };
  }
}
