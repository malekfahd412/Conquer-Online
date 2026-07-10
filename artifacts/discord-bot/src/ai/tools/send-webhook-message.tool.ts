import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class SendWebhookMessageTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'send_webhook_message',
    description: 'Sends a message through an existing webhook, optionally overriding its display name and avatar for this message.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        webhookName: { type: 'string', description: 'Display name of the webhook to send through' },
        content: { type: 'string', description: 'Message content to send' },
        username: { type: 'string', description: 'Override display name for this message (optional)' },
        avatarUrl: { type: 'string', description: 'Override avatar URL for this message (optional)' },
      },
      required: ['channelName', 'webhookName', 'content'],
    },
    dangerous: false,
    examples: ['Send "Server maintenance at midnight" through the "Announcements" webhook'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const content = String(params['content'] ?? '').trim();

    if (!channelName || !webhookName) return { success: false, message: 'Channel name and webhook name are required' };
    if (!content) return { success: false, message: 'Message content is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${channel.name}` };

    const message = await webhook.send({
      content,
      username: params['username'] ? String(params['username']) : undefined,
      avatarURL: params['avatarUrl'] ? String(params['avatarUrl']) : undefined,
    });

    return {
      success: true,
      message: `Sent message via webhook **${webhook.name}** in #${channel.name}`,
      data: { messageId: message.id, webhookId: webhook.id, channelId: channel.id },
    };
  }
}
