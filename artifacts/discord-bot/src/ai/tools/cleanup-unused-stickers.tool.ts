import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupUnusedStickersTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_unused_stickers',
    description: 'Lists all server stickers for review and optionally deletes specified ones by name. Discord does not expose sticker usage frequency — manual review required.',
    parameters: {
      type: 'object',
      properties: {
        delete_names: { type: 'string', description: 'Comma-separated sticker names to delete (only with confirm)' },
        dry_run: { type: 'string', description: 'Preview mode (default: true)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to delete specified stickers' },
      },
      required: [],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dryRun = String(params['dry_run'] ?? 'true').toLowerCase() !== 'false';
    const toDelete = String(params['delete_names'] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (toDelete.length === 0) {
      const stickers = guild.stickers.cache;
      return {
        success: true,
        message: `🎨 **Server Stickers (${stickers.size}):**\n${[...stickers.values()].map(s => `• **${s.name}** — "${s.description ?? 'No description'}" | Format: ${s.format}`).join('\n')}\n\n⚠️ Discord does not expose usage data. Specify \`delete_names\` with a comma-separated list to target specific stickers.`,
      };
    }

    if (!dryRun && String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Set `confirm: "CONFIRM"` to delete stickers.' };
    }

    const found = guild.stickers.cache.filter(s => toDelete.includes(s.name.toLowerCase()));
    if (found.size === 0) return { success: false, message: `None of the specified stickers found: ${toDelete.join(', ')}` };

    if (dryRun) {
      return { success: true, message: `🔍 **Dry Run** — would delete ${found.size} sticker(s):\n${[...found.values()].map(s => `• ${s.name}`).join('\n')}` };
    }

    const deleted: string[] = [];
    for (const [, s] of found) {
      try { await guild.stickers.delete(s.id, 'Cleanup unused stickers'); deleted.push(s.name); } catch { /* skip */ }
    }
    return { success: true, message: `🗑️ Deleted **${deleted.length}** sticker(s): ${deleted.join(', ')}` };
  }
}
