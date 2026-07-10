import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SetChannelTopicTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'set_channel_topic',
    description: 'Sets or clears the topic/description of a text channel.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel' },
        topic: { type: 'string', description: 'New topic text. Leave empty to clear the topic.' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Set #general topic to "Welcome to Mufasa Conquer!"', 'Clear the topic in #announcements'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${params['name']}" not found` };

    const topic = params['topic'] ? String(params['topic']).trim() : null;
    await channel.setTopic(topic);

    return {
      success: true,
      message: topic
        ? `Set topic of **#${channel.name}** to: "${topic}"`
        : `Cleared topic of **#${channel.name}**`,
    };
  }
}
