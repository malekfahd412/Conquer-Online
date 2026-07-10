import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneAllStickersTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_all_stickers',
    description: 'Re-uploads all server stickers from their CDN URLs, creating copies. Note: Discord API requires stickers to be uploaded as files — URL re-upload is supported for PNG/APNG stickers.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix to append to sticker names (default: "_2")' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: `This will re-upload ${guild.stickers.cache.size} sticker(s). Set \`confirm: "CONFIRM"\` to proceed.` };
    }
    const suffix = String(params['suffix'] ?? '_2');
    const created: string[] = [];
    const failed: string[] = [];

    for (const [, sticker] of guild.stickers.cache) {
      const newName = `${sticker.name}${suffix}`.slice(0, 30);
      try {
        const url = sticker.url;
        await guild.stickers.create({
          file: url,
          name: newName,
          tags: sticker.tags ?? 'cloned',
          description: sticker.description ?? undefined,
          reason: 'Clone all stickers',
        });
        created.push(newName);
      } catch (e) {
        failed.push(`${sticker.name}: ${e instanceof Error ? e.message.slice(0, 40) : 'error'}`);
      }
    }

    const lines = [`✅ Sticker clone complete — ${created.length} created, ${failed.length} failed.`];
    if (failed.length > 0) {
      lines.push('', '**Failed:**');
      failed.slice(0, 5).forEach(f => lines.push(`  • ${f}`));
      lines.push('', '⚠️ **Discord API limitation:** Sticker cloning may fail for Lottie (animated) stickers — these require Discord Partner status to upload.');
    }

    return { success: created.length > 0 || failed.length === guild.stickers.cache.size ? true : false, message: lines.join('\n') };
  }
}
