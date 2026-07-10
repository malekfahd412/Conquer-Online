import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EditWebhookMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_webhook_message',
    description: 'Edits a previously sent webhook message by its message ID.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        webhookName: { type: 'string', description: 'Display name of the webhook that sent the message' },
        messageId: { type: 'string', description: 'ID of the webhook message to edit' },
        newContent: { type: 'string', description: 'New message content' },
      },
      required: ['channelName', 'webhookName', 'messageId', 'newContent'],
    },
    dangerous: false,
    examples: ['Edit webhook message 123456789 to say "Updated announcement"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const messageId = String(params['messageId'] ?? '').trim();
    const newContent = String(params['newContent'] ?? '').trim();

    if (!channelName || !webhookName || !messageId) return { success: false, message: 'Channel name, webhook name, and message ID are required' };
    if (!newContent) return { success: false, message: 'New content is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${channel.name}` };

    const before = await webhook.fetchMessage(messageId).catch(() => null);
    if (!before) return { success: false, message: `Webhook message ${messageId} not found` };
    const oldContent = before.content;

    await webhook.editMessage(messageId, { content: newContent });
    return { success: true, message: `Edited webhook message ${messageId} in #${channel.name}`, data: { webhookId: webhook.id, messageId, oldContent } };
  }

  async rollback(params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { messageId, oldContent } = (data as { messageId: string; oldContent: string }) ?? {};
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName) as TextChannel | undefined;
    if (!channel) return { success: false, message: 'Cannot roll back — channel not found' };
    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: 'Cannot roll back — webhook no longer exists' };
    await webhook.editMessage(messageId, { content: oldContent });
    return { success: true, message: 'Rolled back — restored original message content' };
  }
}
