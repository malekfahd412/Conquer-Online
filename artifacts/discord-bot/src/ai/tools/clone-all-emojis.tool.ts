import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneAllEmojisTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_all_emojis',
    description: 'Re-uploads all server emojis from their CDN URLs, creating copies. Useful for migrating emojis or restoring deleted ones. Note: Requires bot to have Manage Emojis permission.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix to append to emoji names (default: "_2")' },
        animated_only: { type: 'string', description: 'Set to "true" to clone only animated emojis' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: `This will re-upload ${guild.emojis.cache.size} emoji(s). Set \`confirm: "CONFIRM"\` to proceed.` };
    }
    const suffix = String(params['suffix'] ?? '_2');
    const animatedOnly = String(params['animated_only'] ?? '').toLowerCase() === 'true';
    const created: string[] = [];
    const failed: string[] = [];

    const emojis = guild.emojis.cache.filter(e => !animatedOnly || e.animated);

    for (const [, emoji] of emojis) {
      const newName = `${emoji.name ?? 'emoji'}${suffix}`.replace(/\W/g, '_').slice(0, 32);
      try {
        await guild.emojis.create({ attachment: emoji.url, name: newName, reason: 'Clone all emojis' });
        created.push(newName);
      } catch { failed.push(emoji.name ?? 'unknown'); }
    }

    return {
      success: true,
      message: `✅ Cloned **${created.length}** emoji(s)${failed.length ? `, ${failed.length} failed` : ''}.\n${failed.length ? `Failed: ${failed.slice(0, 5).join(', ')}` : ''}`,
    };
  }
}
