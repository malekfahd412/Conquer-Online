import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_webhook',
    description: 'Deletes a webhook from a text channel by name.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        webhookName: { type: 'string', description: 'Display name of the webhook to delete' },
      },
      required: ['channelName', 'webhookName'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the webhook and its URL. This cannot be undone.',
    examples: ['Delete the "Announcements" webhook from #general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();

    if (!channelName) return { success: false, message: 'Channel name is required' };
    if (!webhookName) return { success: false, message: 'Webhook name is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);

    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${channel.name}` };

    await webhook.delete();
    return { success: true, message: `Deleted webhook **${webhook.name}** from **#${channel.name}**` };
  }
}
