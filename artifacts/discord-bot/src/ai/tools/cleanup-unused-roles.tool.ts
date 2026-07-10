import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupUnusedRolesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_unused_roles',
    description: 'Deletes roles with zero members assigned (excluding @everyone and managed/bot roles). Use dry_run first.',
    parameters: {
      type: 'object',
      properties: {
        dry_run: { type: 'string', description: 'Preview without deleting (default: true)' },
        skip_hoisted: { type: 'string', description: 'Set to "true" to skip hoisted (displayed) roles' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to delete when dry_run=false' },
      },
      required: [],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dryRun = String(params['dry_run'] ?? 'true').toLowerCase() !== 'false';
    const skipHoisted = String(params['skip_hoisted'] ?? '').toLowerCase() === 'true';
    if (!dryRun && String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Set `confirm: "CONFIRM"` to delete. Use `dry_run: "true"` to preview.' };
    }

    const unused = guild.roles.cache.filter(r => {
      if (r.id === guild.id || r.managed) return false;
      if (skipHoisted && r.hoist) return false;
      return guild.members.cache.filter(m => m.roles.cache.has(r.id)).size === 0;
    });

    if (unused.size === 0) return { success: true, message: '✅ No unused roles found.' };

    if (dryRun) {
      return {
        success: true,
        message: `🔍 **Dry Run** — ${unused.size} unused role(s) would be deleted:\n${[...unused.values()].map(r => `• **${r.name}** (pos: ${r.position})`).join('\n')}\n\nSet \`dry_run: "false"\` + \`confirm: "CONFIRM"\` to delete.`,
      };
    }

    const deleted: string[] = [];
    for (const [, role] of unused) {
      // Skip roles higher than bot's highest role
      const botHighest = guild.members.me?.roles.highest.position ?? 0;
      if (role.position >= botHighest) continue;
      try { await role.delete('Cleanup unused roles'); deleted.push(role.name); } catch { /* skip */ }
    }
    return { success: true, message: `🗑️ Deleted **${deleted.length}** unused role(s): ${deleted.slice(0, 10).map(n => `\`${n}\``).join(', ')}` };
  }
}
