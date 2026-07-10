import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupEmptyChannelsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_empty_channels',
    description: 'Deletes text channels that have no messages (verified by fetching). DESTRUCTIVE — use dry_run first.',
    parameters: {
      type: 'object',
      properties: {
        dry_run: { type: 'string', description: 'Set to "true" to preview without deleting (default: true)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to actually delete (only applies when dry_run=false)' },
      },
      required: [],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dryRun = String(params['dry_run'] ?? 'true').toLowerCase() !== 'false';
    if (!dryRun && String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Set `confirm: "CONFIRM"` to delete channels. Use `dry_run: "true"` to preview first.' };
    }

    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => c as TextChannel);
    const empty: string[] = [];

    for (const ch of textChannels) {
      try {
        const msgs = await ch.messages.fetch({ limit: 1 });
        if (msgs.size === 0) empty.push(ch.name);
      } catch { /* skip inaccessible */ }
    }

    if (empty.length === 0) return { success: true, message: '✅ No empty text channels found.' };

    if (dryRun) {
      return {
        success: true,
        message: `🔍 **Dry Run** — ${empty.length} empty channel(s) would be deleted:\n${empty.map(n => `• #${n}`).join('\n')}\n\nSet \`dry_run: "false"\` and \`confirm: "CONFIRM"\` to delete.`,
      };
    }

    const deleted: string[] = [];
    for (const name of empty) {
      const ch = guild.channels.cache.find(c => c.name === name && c.type === ChannelType.GuildText);
      if (!ch) continue;
      try { await ch.delete('Cleanup empty channels'); deleted.push(name); } catch { /* skip */ }
    }
    return { success: true, message: `🗑️ Deleted **${deleted.length}** empty channel(s): ${deleted.map(n => `\`#${n}\``).join(', ')}` };
  }
}
