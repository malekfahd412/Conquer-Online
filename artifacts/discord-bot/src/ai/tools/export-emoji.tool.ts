import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ExportEmojiTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_emoji',
    description: 'Exports a custom emoji as a portable JSON record (name, image URL, animated flag) for backup or re-import into another server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the emoji to export (without colons). Leave blank to export all emojis.' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Export the emoji "logo" as JSON', 'Export all emojis'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    await guild.emojis.fetch();

    const targets = name
      ? guild.emojis.cache.filter(e => e.name?.toLowerCase() === name)
      : guild.emojis.cache;

    if (targets.size === 0) return { success: false, message: name ? `Emoji "${name}" not found` : 'This server has no custom emojis' };

    const exported = targets.map(e => ({ name: e.name, id: e.id, animated: e.animated, url: e.imageURL({ size: 128 }) }));
    return {
      success: true,
      message: `Exported ${exported.length} emoji record${exported.length === 1 ? '' : 's'}:\n\`\`\`json\n${JSON.stringify(exported, null, 2).slice(0, 1500)}\n\`\`\``,
      data: exported,
    };
  }
}
