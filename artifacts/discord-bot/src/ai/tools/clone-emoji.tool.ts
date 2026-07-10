import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneEmojiTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_emoji',
    description: 'Clones an existing custom emoji from this or another server into this server, using its image URL.',
    parameters: {
      type: 'object',
      properties: {
        sourceImageUrl: { type: 'string', description: 'Image URL of the emoji to clone (e.g. an emoji CDN URL)' },
        newName: { type: 'string', description: 'Name for the cloned emoji in this server' },
      },
      required: ['sourceImageUrl', 'newName'],
    },
    dangerous: false,
    examples: ['Clone this emoji image URL into our server as "hypesquad"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const sourceImageUrl = String(params['sourceImageUrl'] ?? '').trim();
    const newName = String(params['newName'] ?? '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!sourceImageUrl) return { success: false, message: 'A source image URL is required' };
    if (!newName || newName.length < 2) return { success: false, message: 'New name must be at least 2 alphanumeric/underscore characters' };

    const existing = guild.emojis.cache.find(e => e.name?.toLowerCase() === newName.toLowerCase());
    if (existing) return { success: false, message: `An emoji named "${newName}" already exists` };

    const emoji = await guild.emojis.create({ attachment: sourceImageUrl, name: newName, reason: 'Cloned via AI Control Center' });
    return { success: true, message: `Cloned emoji as **:${emoji.name}:** (${emoji.toString()})`, data: { id: emoji.id, name: emoji.name } };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, name } = (data as { id: string; name: string }) ?? {};
    const emoji = id ? guild.emojis.cache.get(id) : undefined;
    if (!emoji) return { success: true, message: 'Emoji already gone' };
    await emoji.delete('Rollback of clone_emoji');
    return { success: true, message: `Rolled back — removed cloned emoji :${name}:` };
  }
}
