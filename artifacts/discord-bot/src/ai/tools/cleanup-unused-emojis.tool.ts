import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupUnusedEmojisTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_unused_emojis',
    description: 'Deletes role-restricted emojis whose restriction roles no longer exist, OR all static/animated emojis if confirmed. Since Discord does not expose usage data, this targets role-restricted emojis with missing roles as safe candidates.',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'Cleanup mode: orphaned_roles (delete emojis with deleted role restrictions, default) | list_all',
          enum: ['orphaned_roles', 'list_all'],
        },
        dry_run: { type: 'string', description: 'Preview without deleting (default: true)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to delete when dry_run=false' },
      },
      required: [],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const mode = String(params['mode'] ?? 'orphaned_roles').toLowerCase();
    const dryRun = String(params['dry_run'] ?? 'true').toLowerCase() !== 'false';
    if (!dryRun && String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Set `confirm: "CONFIRM"` to delete. Use `dry_run: "true"` to preview.' };
    }

    if (mode === 'list_all') {
      const emojis = guild.emojis.cache;
      return { success: true, message: `😀 **All Emojis (${emojis.size}):**\n${[...emojis.values()].slice(0, 30).map(e => `:${e.name}: (${e.animated ? 'animated' : 'static'})`).join(', ')}\n\n⚠️ Discord does not expose usage frequency. Use \`delete_emoji\` to remove specific emojis.` };
    }

    // Find emojis restricted to roles that no longer exist
    const orphaned = guild.emojis.cache.filter(e => {
      if (e.roles.cache.size === 0) return false; // unrestricted
      return [...e.roles.cache.keys()].some(roleId => !guild.roles.cache.has(roleId));
    });

    if (orphaned.size === 0) return { success: true, message: '✅ No orphaned emoji restrictions found.' };

    if (dryRun) {
      return {
        success: true,
        message: `🔍 **Dry Run** — ${orphaned.size} emoji(s) with orphaned role restrictions:\n${[...orphaned.values()].map(e => `• :${e.name}: — restricted to deleted role(s)`).join('\n')}\n\nSet \`dry_run: "false"\` + \`confirm: "CONFIRM"\` to delete these emojis.`,
      };
    }

    const deleted: string[] = [];
    for (const [, e] of orphaned) {
      try { await guild.emojis.delete(e.id, 'Cleanup orphaned emoji role restrictions'); deleted.push(e.name ?? 'unknown'); } catch { /* skip */ }
    }
    return { success: true, message: `🗑️ Deleted **${deleted.length}** orphaned emoji(s): ${deleted.map(n => `:${n}:`).join(', ')}` };
  }
}
