import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupInactiveThreadsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_inactive_threads',
    description: 'Finds active threads with no recent messages and optionally archives or deletes them.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: archive or delete (default: archive)', enum: ['archive', 'delete'] },
        dry_run: { type: 'string', description: 'Preview without changes (default: true)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed when dry_run=false' },
      },
      required: [],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const action = String(params['action'] ?? 'archive').toLowerCase();
    const dryRun = String(params['dry_run'] ?? 'true').toLowerCase() !== 'false';
    if (!dryRun && String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: `⚠️ Set \`confirm: "CONFIRM"\` to ${action} inactive threads.` };
    }

    let activeThreads;
    try {
      activeThreads = await guild.channels.fetchActiveThreads();
    } catch {
      return { success: false, message: 'Failed to fetch active threads' };
    }

    if (activeThreads.threads.size === 0) return { success: true, message: '✅ No active threads found.' };

    // Find threads older than 7 days with no recent messages
    const inactive = [...activeThreads.threads.values()].filter(t => {
      const lastMsg = t.lastMessage?.createdTimestamp ?? t.createdTimestamp ?? 0;
      return (Date.now() - (lastMsg ?? 0)) > 7 * 24 * 60 * 60 * 1000;
    });

    if (inactive.length === 0) return { success: true, message: `✅ All ${activeThreads.threads.size} active threads have recent activity.` };

    if (dryRun) {
      return {
        success: true,
        message: `🔍 **Dry Run** — ${inactive.length} inactive thread(s) would be ${action}d:\n${inactive.slice(0, 10).map(t => `• **${t.name}** (${t.parent ? `#${t.parent.name}` : 'unknown channel'})`).join('\n')}\n\nSet \`dry_run: "false"\` + \`confirm: "CONFIRM"\` to proceed.`,
      };
    }

    const processed: string[] = [];
    for (const thread of inactive) {
      try {
        if (action === 'archive') { await thread.setArchived(true, 'Cleanup inactive threads'); }
        else { await thread.delete('Cleanup inactive threads'); }
        processed.push(thread.name);
      } catch { /* skip */ }
    }

    return { success: true, message: `✅ ${action === 'archive' ? 'Archived' : 'Deleted'} **${processed.length}** inactive thread(s).` };
  }
}
