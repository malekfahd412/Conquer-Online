import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { aiTransform } from './ai-text-helper';

export class RewriteMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rewrite_message',
    description: 'Rewrites a message in a specified tone or style using AI (formal, casual, professional, concise, etc.).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID to rewrite' },
        style: { type: 'string', description: 'Target style: formal, casual, professional, concise, friendly, or custom description' },
        post_result: { type: 'string', description: 'Post rewritten version to the channel (true/false, default false)' },
      },
      required: ['channel', 'message_id', 'style'],
    },
    dangerous: false,
    examples: ['Rewrite message 123456 in #general to sound more formal', 'Rewrite this announcement to be more concise'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();
    const messageId = String(params['message_id'] ?? '').trim();
    const style = String(params['style'] ?? 'professional').trim();
    const postResult = String(params['post_result'] ?? 'false') === 'true';

    const ch = guild.channels.cache.find(c =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      (c.id === chQuery || c.name.toLowerCase() === chQuery),
    ) as TextChannel | undefined;
    if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };

    const msg = await ch.messages.fetch(messageId);
    if (!msg.content) return { success: false, message: 'Message has no text content to rewrite' };

    const rewritten = await aiTransform(`Rewrite the following text in a ${style} style. Keep the same core meaning.`, msg.content);

    if (postResult) {
      await ch.send(`✏️ **Rewritten (${style} style):**\n${rewritten}`);
    }

    return { success: true, message: `✅ Rewritten in **${style}** style:\n${rewritten}` };
  }
}
