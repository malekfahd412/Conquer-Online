import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneStickerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_sticker',
    description: 'Clones a sticker image (from an image URL, e.g. another sticker\'s CDN URL) into this server as a new sticker.',
    parameters: {
      type: 'object',
      properties: {
        sourceImageUrl: { type: 'string', description: 'Image URL of the sticker to clone' },
        newName: { type: 'string', description: 'Name for the cloned sticker' },
        tags: { type: 'string', description: 'A related emoji or short tag for autocomplete' },
      },
      required: ['sourceImageUrl', 'newName', 'tags'],
    },
    dangerous: false,
    examples: ['Clone this sticker image as "party-clone"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const sourceImageUrl = String(params['sourceImageUrl'] ?? '').trim();
    const newName = String(params['newName'] ?? '').trim();
    const tags = String(params['tags'] ?? '').trim();
    if (!sourceImageUrl) return { success: false, message: 'A source image URL is required' };
    if (newName.length < 2) return { success: false, message: 'New name must be at least 2 characters' };
    if (!tags) return { success: false, message: 'A tag/emoji is required for autocomplete' };

    const response = await fetch(sourceImageUrl);
    if (!response.ok) return { success: false, message: `Could not download source image (HTTP ${response.status})` };
    const buffer = Buffer.from(await response.arrayBuffer());

    const sticker = await guild.stickers.create({ file: buffer, name: newName, tags, reason: 'Cloned via AI Control Center' });
    return { success: true, message: `Cloned sticker as **${sticker.name}**`, data: { id: sticker.id, name: sticker.name } };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, name } = (data as { id: string; name: string }) ?? {};
    const sticker = id ? await guild.stickers.fetch(id).catch(() => undefined) : undefined;
    if (!sticker) return { success: true, message: 'Sticker already gone' };
    await sticker.delete('Rollback of clone_sticker');
    return { success: true, message: `Rolled back — removed cloned sticker ${name}` };
  }
}
