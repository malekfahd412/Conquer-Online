import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupEmptyCatsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_empty_categories',
    description: 'Finds and optionally deletes categories that contain no channels.',
    parameters: {
      type: 'object',
      properties: {
        dry_run: { type: 'string', description: 'Preview without deleting (default: true)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to delete when dry_run=false' },
      },
      required: [],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dryRun = String(params['dry_run'] ?? 'true').toLowerCase() !== 'false';
    if (!dryRun && String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Set `confirm: "CONFIRM"` to delete. Use `dry_run: "true"` to preview.' };
    }

    const emptyCats = guild.channels.cache.filter(c => {
      if (c.type !== ChannelType.GuildCategory) return false;
      const children = guild.channels.cache.filter(ch => 'parentId' in ch && (ch as { parentId?: string }).parentId === c.id);
      return children.size === 0;
    });

    if (emptyCats.size === 0) return { success: true, message: '✅ No empty categories found.' };

    if (dryRun) {
      return {
        success: true,
        message: `🔍 **Dry Run** — ${emptyCats.size} empty categor(ies) would be deleted:\n${[...emptyCats.values()].map(c => `• 📁 ${c.name}`).join('\n')}\n\nSet \`dry_run: "false"\` + \`confirm: "CONFIRM"\` to delete.`,
      };
    }

    let deleted = 0;
    for (const [, cat] of emptyCats) {
      try { await cat.delete('Cleanup empty categories'); deleted++; } catch { /* skip */ }
    }
    return { success: true, message: `🗑️ Deleted **${deleted}** empty categor(ies).` };
  }
}
