import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EditWebhookAvatarTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_webhook_avatar',
    description: "Changes a webhook's avatar image.",
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        webhookName: { type: 'string', description: 'Display name of the webhook to edit' },
        imageUrl: { type: 'string', description: 'Direct URL of the new avatar image' },
      },
      required: ['channelName', 'webhookName', 'imageUrl'],
    },
    dangerous: false,
    examples: ['Change the avatar of the "Announcements" webhook to this image URL'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const imageUrl = String(params['imageUrl'] ?? '').trim();

    if (!channelName || !webhookName) return { success: false, message: 'Channel name and webhook name are required' };
    if (!imageUrl) return { success: false, message: 'An image URL is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${channel.name}` };

    const oldAvatar = webhook.avatarURL();
    await webhook.edit({ avatar: imageUrl });
    return { success: true, message: `Updated avatar for webhook **${webhook.name}**`, data: { id: webhook.id, oldAvatar } };
  }

  async rollback(params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, oldAvatar } = (data as { id: string; oldAvatar: string | null }) ?? {};
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName) as TextChannel | undefined;
    if (!channel) return { success: false, message: 'Cannot roll back — channel not found' };
    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.get(id);
    if (!webhook) return { success: false, message: 'Cannot roll back — webhook no longer exists' };
    await webhook.edit({ avatar: oldAvatar ?? null });
    return { success: true, message: 'Rolled back — restored previous avatar' };
  }
}
