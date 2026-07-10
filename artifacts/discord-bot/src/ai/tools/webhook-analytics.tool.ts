import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class WebhookAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'webhook_analytics',
    description: 'Shows server-wide webhook statistics: total count, per-channel breakdown, and the 15-webhooks-per-channel limit usage.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show webhook analytics', 'How many webhooks does the server have?'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    let total = 0;
    const perChannel: string[] = [];

    for (const channel of textChannels.values()) {
      const webhooks = await (channel as TextChannel).fetchWebhooks().catch(() => null);
      if (!webhooks || webhooks.size === 0) continue;
      total += webhooks.size;
      perChannel.push(`• #${channel.name} — ${webhooks.size}/15`);
    }

    if (total === 0) return { success: true, message: 'This server has no webhooks' };

    return {
      success: true,
      message: `**📊 Webhook Analytics — ${guild.name}**\n• Total webhooks: ${total}\n\n${perChannel.slice(0, 25).join('\n')}`,
      data: { total },
    };
  }
}
