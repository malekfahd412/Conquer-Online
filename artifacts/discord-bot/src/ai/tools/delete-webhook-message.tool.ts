import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteWebhookMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_webhook_message',
    description: 'Deletes a message that was sent through a webhook, by its message ID.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        webhookName: { type: 'string', description: 'Display name of the webhook that sent the message' },
        messageId: { type: 'string', description: 'ID of the webhook message to delete' },
      },
      required: ['channelName', 'webhookName', 'messageId'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the webhook message. This cannot be undone.',
    examples: ['Delete webhook message 123456789 in #general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const messageId = String(params['messageId'] ?? '').trim();

    if (!channelName || !webhookName || !messageId) return { success: false, message: 'Channel name, webhook name, and message ID are required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${channel.name}` };

    await webhook.deleteMessage(messageId);
    return { success: true, message: `Deleted webhook message ${messageId} in #${channel.name}` };
  }
}
