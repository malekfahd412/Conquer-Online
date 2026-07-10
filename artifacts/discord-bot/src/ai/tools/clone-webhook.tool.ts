import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_webhook',
    description: 'Clones an existing webhook (name + avatar) into the same or a different channel as a brand new webhook.',
    parameters: {
      type: 'object',
      properties: {
        sourceChannelName: { type: 'string', description: 'Name of the channel containing the webhook to clone' },
        webhookName: { type: 'string', description: 'Display name of the webhook to clone' },
        targetChannelName: { type: 'string', description: 'Channel to create the clone in (defaults to sourceChannelName)' },
        newName: { type: 'string', description: 'Name for the cloned webhook (defaults to the same name)' },
      },
      required: ['sourceChannelName', 'webhookName'],
    },
    dangerous: false,
    examples: ['Clone the "Announcements" webhook into #news'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const sourceChannelName = String(params['sourceChannelName'] ?? '').trim().toLowerCase();
    const webhookName = String(params['webhookName'] ?? '').trim().toLowerCase();
    const targetChannelName = String(params['targetChannelName'] ?? sourceChannelName).trim().toLowerCase();
    const newName = params['newName'] ? String(params['newName']) : undefined;

    if (!sourceChannelName || !webhookName) return { success: false, message: 'Source channel and webhook name are required' };

    const sourceChannel = guild.channels.cache.find(
      c => c.name.toLowerCase() === sourceChannelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!sourceChannel) return { success: false, message: `Text channel "${sourceChannelName}" not found` };

    const targetChannel = guild.channels.cache.find(
      c => c.name.toLowerCase() === targetChannelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (!targetChannel) return { success: false, message: `Text channel "${targetChannelName}" not found` };

    const webhooks = await sourceChannel.fetchWebhooks();
    const source = webhooks.find(w => w.name.toLowerCase() === webhookName);
    if (!source) return { success: false, message: `Webhook "${params['webhookName']}" not found in #${sourceChannel.name}` };

    const clone = await targetChannel.createWebhook({
      name: newName ?? source.name,
      avatar: source.avatarURL() ?? undefined,
      reason: 'Cloned via AI Control Center',
    });

    return {
      success: true,
      message: `Cloned webhook **${source.name}** → **${clone.name}** in #${targetChannel.name}`,
      data: { id: clone.id, name: clone.name },
    };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, name } = (data as { id: string; name: string }) ?? {};
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText) continue;
      const webhooks = await (channel as TextChannel).fetchWebhooks().catch(() => null);
      const webhook = webhooks?.get(id);
      if (webhook) {
        await webhook.delete('Rollback of clone_webhook');
        return { success: true, message: `Rolled back — removed cloned webhook ${name}` };
      }
    }
    return { success: true, message: 'Cloned webhook already gone' };
  }
}
