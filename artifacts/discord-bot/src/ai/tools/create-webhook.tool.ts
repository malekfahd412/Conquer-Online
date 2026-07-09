import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_webhook',
    description: 'Creates a webhook in a text channel. Returns the webhook URL.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Name of the text channel to create the webhook in' },
        name: { type: 'string', description: 'Display name for the webhook' },
        reason: { type: 'string', description: 'Reason for creating the webhook (optional)' },
      },
      required: ['channelName', 'name'],
    },
    dangerous: false,
    examples: ['Create a webhook named "Announcements" in #general'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    const name = String(params['name'] ?? '').trim();

    if (!channelName) return { success: false, message: 'Channel name is required' };
    if (!name) return { success: false, message: 'Webhook name is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Text channel "${channelName}" not found` };

    const webhook = await channel.createWebhook({
      name,
      reason: params['reason'] ? String(params['reason']) : undefined,
    });

    return {
      success: true,
      message: `Created webhook **${name}** in **#${channel.name}** (URL ends in \`...${webhook.token?.slice(-6) ?? '??????'}\`)`,
      data: { id: webhook.id, url: webhook.url },
    };
  }
}
