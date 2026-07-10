import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkDeleteMessagesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_delete_messages',
    description: 'Bulk deletes (purges) recent messages in a channel. Discord only allows deleting messages newer than 14 days. Max 100 per call.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Name of the channel to purge' },
        count: { type: 'string', description: 'Number of messages to delete (1–100)' },
        user: { type: 'string', description: 'Only delete messages from this user (optional username or display name)' },
      },
      required: ['channel', 'count'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes up to 100 messages. This cannot be undone.',
    examples: ['Delete the last 50 messages in #general', 'Purge 20 messages from SpamBot in #chat'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channel'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase() === channelName,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${params['channel']}" not found` };

    const count = Math.min(100, Math.max(1, parseInt(String(params['count'] ?? '10'), 10)));
    if (isNaN(count)) return { success: false, message: 'Count must be a number between 1 and 100' };

    let messages = await channel.messages.fetch({ limit: count });

    if (params['user']) {
      const username = String(params['user']).trim().toLowerCase();
      messages = messages.filter(
        m => m.author.username.toLowerCase() === username || m.member?.displayName.toLowerCase() === username,
      );
    }

    if (messages.size === 0) return { success: false, message: 'No messages found matching the criteria' };

    const deleted = await channel.bulkDelete(messages, true);
    return {
      success: true,
      message: `🗑️ Deleted **${deleted.size}** message(s) from **#${channel.name}**${params['user'] ? ` by "${params['user']}"` : ''}`,
    };
  }
}
