import { StickerFormatType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class StickerAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'sticker_analytics',
    description: 'Shows server-wide sticker statistics: total count, format breakdown, and slot usage against the server boost tier limit.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show sticker analytics', 'How many sticker slots are left?'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    await guild.stickers.fetch();
    const stickers = guild.stickers.cache;
    const png = stickers.filter(s => s.format === StickerFormatType.PNG).size;
    const apng = stickers.filter(s => s.format === StickerFormatType.APNG).size;
    const lottie = stickers.filter(s => s.format === StickerFormatType.Lottie).size;
    const gif = stickers.filter(s => s.format === StickerFormatType.GIF).size;

    const limitByTier: Record<number, number> = { 0: 5, 1: 15, 2: 30, 3: 60 };
    const limit = limitByTier[guild.premiumTier] ?? 5;

    return {
      success: true,
      message: `**📊 Sticker Analytics — ${guild.name}**\n• Total: ${stickers.size}/${limit}\n• PNG: ${png}\n• APNG: ${apng}\n• Lottie: ${lottie}\n• GIF: ${gif}`,
      data: { total: stickers.size, png, apng, lottie, gif, limit },
    };
  }
}
