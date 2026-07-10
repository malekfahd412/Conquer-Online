import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MoveWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'move_webhook',
    description: 'Moves a webhook to a different text channel.',
    parameters: {
      type: 'object',
      properties: {
        currentChannelName: { type: 'string', description: 'Name of the channel the webhook currently posts to' },
        webhookName: { type: 'string', description: 'Display name of the webhook to move' },
        targetChannelName: { type: 'string', description: 'Name of the text channel to move the webhook to' },
      },
      required: ['currentChannelName', 'webhookName', 'targetChannelName'],
    },
    dangerous: false,
    examples: ['Move the "Announcements" webhook from #general to #news'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const currentChannelName = String(params['currentChannelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const targetChannelName = String(params['targetChannelName'] ?? '').trim().toLowerCase();

    if (!currentChannelName || !webhookName || !targetChannelName) {
      return { success: false, message: 'currentChannelName, webhookName, and targetChannelName are all required' };
    }

    const currentChannel = guild.channels.cache.find(
      c => c.name.toLowerCase() === currentChannelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!currentChannel) return { success: false, message: `Text channel "${currentChannelName}" not found` };

    const targetChannel = guild.channels.cache.find(
      c => c.name.toLowerCase() === targetChannelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!targetChannel) return { success: false, message: `Text channel "${targetChannelName}" not found` };

    const webhooks = await currentChannel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!webhook) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${currentChannel.name}` };

    await webhook.edit({ channel: targetChannel.id });
    return {
      success: true,
      message: `Moved webhook **${webhook.name}** from #${currentChannel.name} → #${targetChannel.name}`,
      data: { id: webhook.id, fromChannelId: currentChannel.id },
    };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, fromChannelId } = (data as { id: string; fromChannelId: string }) ?? {};
    if (!id || !fromChannelId) return { success: false, message: 'Missing rollback data' };
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText) continue;
      const webhooks = await (channel as TextChannel).fetchWebhooks().catch(() => null);
      const webhook = webhooks?.get(id);
      if (webhook) {
        await webhook.edit({ channel: fromChannelId });
        return { success: true, message: 'Rolled back — moved webhook back to its original channel' };
      }
    }
    return { success: false, message: 'Webhook no longer exists — cannot roll back' };
  }
}
