import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_webhook',
    description: 'Renames a webhook in a text channel.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the channel containing the webhook' },
        currentName: { type: 'string', description: 'Current display name of the webhook' },
        newName: { type: 'string', description: 'New display name for the webhook' },
      },
      required: ['channelName', 'currentName', 'newName'],
    },
    dangerous: false,
    examples: ['Rename the "Announcements" webhook in #general to "News"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const currentName = String(params['currentName'] ?? '').trim().toLowerCase();
    const newName = String(params['newName'] ?? '').trim();

    if (!channelName || !currentName) return { success: false, message: 'Channel name and current webhook name are required' };
    if (!newName) return { success: false, message: 'New webhook name is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(w => w.name.toLowerCase() === currentName);
    if (!webhook) return { success: false, message: `Webhook "${params['currentName']}" not found in #${channel.name}` };

    const oldName = webhook.name;
    await webhook.edit({ name: newName });
    return { success: true, message: `Renamed webhook **${oldName}** → **${newName}** in #${channel.name}`, data: { id: webhook.id, oldName } };
  }

  async rollback(params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, oldName } = (data as { id: string; oldName: string }) ?? {};
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName) as TextChannel | undefined;
    if (!channel) return { success: false, message: 'Cannot roll back — channel not found' };
    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.get(id);
    if (!webhook) return { success: false, message: 'Cannot roll back — webhook no longer exists' };
    await webhook.edit({ name: oldName });
    return { success: true, message: `Rolled back — renamed webhook back to ${oldName}` };
  }
}
