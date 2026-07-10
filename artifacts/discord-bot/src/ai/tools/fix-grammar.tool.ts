import type { Guild, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { aiTransform } from './ai-text-helper';

export class FixGrammarTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'fix_grammar',
    description: 'Fixes grammar, spelling, and punctuation in a message using AI. Returns corrected version.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        message_id: { type: 'string', description: 'Message ID to fix' },
        post_result: { type: 'string', description: 'Post corrected version to the channel (true/false, default false)' },
      },
      required: ['channel', 'message_id'],
    },
    dangerous: false,
    examples: ['Fix grammar in message 123456 in #announcements', 'Check and fix this message for spelling errors'],
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

    const msg = await ch.messages.fetch(messageId);
    if (!msg.content) return { success: false, message: 'Message has no text content' };

    const fixed = await aiTransform('Fix all grammar, spelling, and punctuation errors in the following text. Keep the original meaning and tone intact.', msg.content);

    if (postResult) {
      await ch.send(`📝 **Grammar-corrected version:**\n${fixed}`);
    }

    return { success: true, message: `✅ Grammar-corrected:\n**Before:** ${msg.content}\n**After:** ${fixed}` };
  }
}
