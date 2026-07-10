import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UploadStickerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'upload_sticker',
    description: 'Uploads a new custom sticker to the server from an image URL (PNG or APNG, max 320x320, 512KB).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Sticker name (2-30 characters)' },
        imageUrl: { type: 'string', description: 'Direct URL of the PNG/APNG image to use' },
        tags: { type: 'string', description: 'A related emoji or short tag, used for autocomplete (e.g. "wave")' },
        description: { type: 'string', description: 'Short description of the sticker (optional)' },
      },
      required: ['name', 'imageUrl', 'tags'],
    },
    dangerous: false,
    examples: ['Upload a sticker named "wave" from this image URL'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const imageUrl = String(params['imageUrl'] ?? '').trim();
    const tags = String(params['tags'] ?? '').trim();
    const description = params['description'] ? String(params['description']) : '';

    if (name.length < 2) return { success: false, message: 'Sticker name must be at least 2 characters' };
    if (!imageUrl) return { success: false, message: 'An image URL is required' };
    if (!tags) return { success: false, message: 'A related tag/emoji is required for autocomplete' };

    const response = await fetch(imageUrl);
    if (!response.ok) return { success: false, message: `Could not download image (HTTP ${response.status})` };
    const buffer = Buffer.from(await response.arrayBuffer());

    const sticker = await guild.stickers.create({ file: buffer, name, tags, description, reason: 'Uploaded via AI Control Center' });

    return {
      success: true,
      message: `Uploaded sticker **${sticker.name}** (tags: ${sticker.tags ?? tags})`,
      data: { id: sticker.id, name: sticker.name },
    };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, name } = (data as { id: string; name: string }) ?? {};
    const sticker = id ? await guild.stickers.fetch(id).catch(() => undefined) : undefined;
    if (!sticker) return { success: true, message: 'Sticker already gone' };
    await sticker.delete('Rollback of upload_sticker');
    return { success: true, message: `Rolled back — removed sticker ${name}` };
  }
}
