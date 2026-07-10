import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameStickerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_sticker',
    description: 'Renames an existing custom sticker.',
    parameters: {
      type: 'object',
      properties: {
        currentName: { type: 'string', description: 'Current name of the sticker' },
        newName: { type: 'string', description: 'New name for the sticker' },
      },
      required: ['currentName', 'newName'],
    },
    dangerous: false,
    examples: ['Rename the sticker "wave1" to "hello-wave"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const currentName = String(params['currentName'] ?? '').trim().toLowerCase();
    const newName = String(params['newName'] ?? '').trim();
    if (!currentName) return { success: false, message: 'Current sticker name is required' };
    if (newName.length < 2) return { success: false, message: 'New name must be at least 2 characters' };

    await guild.stickers.fetch();
    const sticker = guild.stickers.cache.find(s => s.name.toLowerCase() === currentName);
    if (!sticker) return { success: false, message: `Sticker "${currentName}" not found` };

    const oldName = sticker.name;
    const updated = await sticker.edit({ name: newName });
    return { success: true, message: `Renamed sticker **${oldName}** → **${updated.name}**`, data: { id: updated.id, oldName } };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, oldName } = (data as { id: string; oldName: string }) ?? {};
    const sticker = id ? await guild.stickers.fetch(id).catch(() => undefined) : undefined;
    if (!sticker) return { success: false, message: 'Sticker no longer exists — cannot roll back name' };
    await sticker.edit({ name: oldName });
    return { success: true, message: `Rolled back — renamed sticker back to ${oldName}` };
  }
}
