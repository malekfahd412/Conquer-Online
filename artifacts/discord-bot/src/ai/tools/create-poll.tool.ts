import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreatePollTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_poll',
    description: 'Creates a native Discord poll in a text channel.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel to post the poll in' },
        question: { type: 'string', description: 'The poll question' },
        answers: { type: 'string', description: 'Comma-separated list of answers (2-10 options)' },
        duration: { type: 'string', description: 'Poll duration in hours (1-336, default: 24)' },
        allowMultiselect: { type: 'string', description: 'Allow multiple selections: "true" or "false" (default: false)' },
      },
      required: ['channelName', 'question', 'answers'],
    },
    dangerous: false,
    examples: ['Create a poll "What event should we run?" with options "Guild War, Boss Hunt, PK Tournament" in #polls'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const question = String(params['question'] ?? '').trim();
    const answersRaw = String(params['answers'] ?? '').trim();

    if (!channelName) return { success: false, message: 'Channel name is required' };
    if (!question) return { success: false, message: 'Poll question is required' };
    if (!answersRaw) return { success: false, message: 'Poll answers are required' };

    const answers = answersRaw.split(',').map(a => a.trim()).filter(Boolean);
    if (answers.length < 2) return { success: false, message: 'At least 2 answer options are required' };
    if (answers.length > 10) return { success: false, message: 'Maximum 10 answer options allowed' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const duration = Math.min(336, Math.max(1, parseInt(String(params['duration'] ?? '24')) || 24));
    const allowMultiselect = String(params['allowMultiselect'] ?? 'false').toLowerCase() === 'true';

    try {
      const msg = await channel.send({
        poll: {
          question: { text: question },
          answers: answers.map(text => ({ text })),
          duration,
          allowMultiselect,
        },
      });

      return {
        success: true,
        message: `Created poll **"${question}"** with ${answers.length} options in **#${channel.name}** (${duration}h)`,
        data: { messageId: msg.id },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create poll: ${error instanceof Error ? error.message : 'Unknown error'}. Polls require the server to have the Community feature enabled.`,
      };
    }
  }
}
