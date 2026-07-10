import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ExportWebhookTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_webhook',
    description: 'Exports non-sensitive webhook metadata (name, channel, avatar) as JSON for backup or recreation. The webhook token/URL is never exported for security.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Channel to export webhooks from. Leave blank to export all webhooks in the server.' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Export webhook metadata for #general', 'Export all webhook metadata'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();

    const channels = channelName
      ? guild.channels.cache.filter(c => c.name.toLowerCase() === channelName && c.type === ChannelType.GuildText)
      : guild.channels.cache.filter(c => c.type === ChannelType.GuildText);

    if (channels.size === 0) return { success: false, message: channelName ? `Text channel "${channelName}" not found` : 'No text channels found' };

    const exported: { name: string; channelName: string; channelId: string; avatarUrl: string | null }[] = [];
    for (const channel of channels.values()) {
      const webhooks = await (channel as TextChannel).fetchWebhooks().catch(() => null);
      if (!webhooks) continue;
      for (const webhook of webhooks.values()) {
        exported.push({ name: webhook.name, channelName: channel.name, channelId: channel.id, avatarUrl: webhook.avatarURL() });
      }
    }

    if (exported.length === 0) return { success: true, message: 'No webhooks found to export' };

    return {
      success: true,
      message: `Exported ${exported.length} webhook record(s) (tokens excluded for security):\n\`\`\`json\n${JSON.stringify(exported, null, 2).slice(0, 1500)}\n\`\`\``,
      data: exported,
    };
  }
}
