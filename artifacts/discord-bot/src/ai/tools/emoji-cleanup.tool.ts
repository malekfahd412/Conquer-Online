import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EmojiCleanupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'emoji_cleanup',
    description: 'Bulk-deletes custom emojis matching a name prefix/substring, or all emojis managed by removed integrations. Use with care.',
    parameters: {
      type: 'object',
      properties: {
        namePattern: { type: 'string', description: 'Substring to match emoji names against for deletion (case-insensitive). Required unless onlyManaged is used.' },
        onlyManaged: { type: 'string', description: '"true" to only delete integration-managed (e.g. Twitch sub) emojis' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes every matching emoji. This cannot be undone in bulk.',
    examples: ['Clean up all emojis with "temp" in the name', 'Remove all managed emojis'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const namePattern = String(params['namePattern'] ?? '').trim().toLowerCase();
    const onlyManaged = String(params['onlyManaged'] ?? '').toLowerCase() === 'true';

    if (!namePattern && !onlyManaged) return { success: false, message: 'Provide a namePattern or set onlyManaged=true' };

    await guild.emojis.fetch();
    const targets = guild.emojis.cache.filter(e =>
      (onlyManaged ? e.managed : true) && (namePattern ? (e.name?.toLowerCase().includes(namePattern) ?? false) : true),
    );

    if (targets.size === 0) return { success: false, message: 'No emojis matched the cleanup filter' };

    const removed: string[] = [];
    for (const emoji of targets.values()) {
      try {
        await emoji.delete('Bulk cleanup via AI Control Center');
        removed.push(emoji.name ?? emoji.id);
      } catch { /* skip failures */ }
    }

    return { success: removed.length > 0, message: `Removed ${removed.length} emoji(s): ${removed.join(', ')}`, data: { removed } };
  }
}
