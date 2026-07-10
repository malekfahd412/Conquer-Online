import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EmojiAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'emoji_analytics',
    description: 'Shows server-wide emoji statistics: total count, static vs animated, slot usage against the server boost tier limit.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show emoji analytics', 'How many emoji slots are left?'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    await guild.emojis.fetch();
    const emojis = guild.emojis.cache;
    const animated = emojis.filter(e => e.animated).size;
    const staticCount = emojis.size - animated;
    const managed = emojis.filter(e => e.managed).size;

    const limitByTier: Record<number, number> = { 0: 50, 1: 100, 2: 150, 3: 250 };
    const limit = limitByTier[guild.premiumTier] ?? 50;

    return {
      success: true,
      message: `**📊 Emoji Analytics — ${guild.name}**\n• Total: ${emojis.size} / ${limit * 2} (static + animated pools, ${limit} each)\n• Static: ${staticCount}/${limit}\n• Animated: ${animated}/${limit}\n• Managed (integration) emojis: ${managed}\n\n_Note: Discord's API does not expose per-emoji usage counts; tracking real usage requires scanning message history and is not enabled by default._`,
      data: { total: emojis.size, static: staticCount, animated, managed, limit },
    };
  }
}
