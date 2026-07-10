import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EmojiInfoTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'emoji_info',
    description: 'Shows details about a specific custom emoji: id, animated flag, creator, and creation date.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the emoji to inspect (without colons)' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Show info about the emoji "logo"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Emoji name is required' };

    await guild.emojis.fetch();
    const emoji = guild.emojis.cache.find(e => e.name?.toLowerCase() === name);
    if (!emoji) return { success: false, message: `Emoji "${name}" not found` };

    let author = 'Unknown';
    try {
      const fetched = await emoji.fetchAuthor();
      author = fetched.tag;
    } catch { /* requires MANAGE_GUILD_EXPRESSIONS on bot — best effort */ }

    const created = `<t:${Math.floor(emoji.createdTimestamp / 1000)}:R>`;
    return {
      success: true,
      message: `**:${emoji.name}:** (${emoji.toString()})\n• ID: \`${emoji.id}\`\n• Animated: ${emoji.animated ? 'Yes' : 'No'}\n• Managed: ${emoji.managed ? 'Yes' : 'No'}\n• Created: ${created}\n• Uploaded by: ${author}\n• URL: ${emoji.imageURL()}`,
      data: { id: emoji.id, name: emoji.name, animated: emoji.animated, author },
    };
  }
}
