import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnusedStickersReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unused_stickers_report',
    description: 'Lists all server stickers with their details. Note: Discord does not expose sticker usage frequency, so all stickers are listed for manual review.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const stickers = guild.stickers.cache;
    if (stickers.size === 0) return { success: true, message: `**${guild.name}** has no custom stickers` };

    const lines = [
      `🎨 **Stickers Report** — **${guild.name}** (${stickers.size} sticker(s))\n`,
    ];
    for (const [, sticker] of stickers) {
      lines.push(`• **${sticker.name}** — "${sticker.description ?? 'No description'}" | Format: ${sticker.format} | ID: \`${sticker.id}\``);
    }
    lines.push(`\n⚠️ **Discord API limitation:** Sticker usage frequency is not exposed. Review manually before deleting.`);
    lines.push(`💡 Use \`delete_sticker\` or \`cleanup_unused_stickers\` to manage stickers.`);

    return { success: true, message: lines.join('\n') };
  }
}
