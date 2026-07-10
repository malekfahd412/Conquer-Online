import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class WebhookInspectorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'webhook_inspector',
    description: 'Shows full details for a specific webhook: id, channel, creator, and avatar. The token/URL is never shown for security.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        webhookName: { type: 'string', description: 'Display name of the webhook to inspect' },
      },
      required: ['channelName', 'webhookName'],
    },
    dangerous: false,
    examples: ['Inspect the "Announcements" webhook in #general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    if (!channelName || !webhookName) return { success: false, message: 'Channel name and webhook name are required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${channel.name}` };

    const created = `<t:${Math.floor(webhook.createdTimestamp / 1000)}:R>`;
    return {
      success: true,
      message: `**🔍 Webhook ${webhook.name}**\n• ID: \`${webhook.id}\`\n• Channel: #${channel.name}\n• Owner: ${webhook.owner && 'tag' in webhook.owner ? webhook.owner.tag : 'Unknown'}\n• Created: ${created}\n• Has avatar: ${webhook.avatarURL() ? 'Yes' : 'No'}`,
      data: { id: webhook.id, name: webhook.name, channelId: channel.id },
    };
  }
}
