import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UploadEmojiTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'upload_emoji',
    description: 'Uploads a new custom emoji to the server from an image URL.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the emoji (2-32 characters, alphanumeric/underscore)' },
        imageUrl: { type: 'string', description: 'Direct URL of the image (png, jpg, gif) to use as the emoji' },
        reason: { type: 'string', description: 'Reason for the audit log (optional)' },
      },
      required: ['name', 'imageUrl'],
    },
    dangerous: false,
    examples: ['Upload an emoji named "pepehappy" from this image URL'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    const imageUrl = String(params['imageUrl'] ?? '').trim();

    if (!name || name.length < 2) return { success: false, message: 'Emoji name must be at least 2 alphanumeric/underscore characters' };
    if (!imageUrl) return { success: false, message: 'An image URL is required' };

    const existing = guild.emojis.cache.find(e => e.name?.toLowerCase() === name.toLowerCase());
    if (existing) return { success: false, message: `An emoji named "${name}" already exists` };

    const emoji = await guild.emojis.create({
      attachment: imageUrl,
      name,
      reason: params['reason'] ? String(params['reason']) : undefined,
    });

    return {
      success: true,
      message: `Uploaded emoji **:${emoji.name}:** (${emoji.toString()})`,
      data: { id: emoji.id, name: emoji.name, animated: emoji.animated },
    };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, name } = (data as { id: string; name: string }) ?? {};
    if (!id) return { success: false, message: 'No emoji id to roll back' };
    const emoji = guild.emojis.cache.get(id);
    if (!emoji) return { success: true, message: 'Emoji already gone' };
    await emoji.delete('Rollback of upload_emoji');
    return { success: true, message: `Rolled back — removed emoji :${name}:` };
  }
}
