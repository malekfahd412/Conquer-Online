import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteStickerTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_sticker',
    description: 'Deletes a custom sticker from the server by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the sticker to delete' },
        reason: { type: 'string', description: 'Reason for the audit log (optional)' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently removes the sticker from the server.',
    examples: ['Delete the sticker named "oldwave"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Sticker name is required' };

    await guild.stickers.fetch();
    const sticker = guild.stickers.cache.find(s => s.name.toLowerCase() === name);
    if (!sticker) return { success: false, message: `Sticker "${name}" not found` };

    const snapshot = { id: sticker.id, name: sticker.name, tags: sticker.tags, description: sticker.description, url: sticker.url };
    await sticker.delete(params['reason'] ? String(params['reason']) : 'Deleted via AI Control Center');

    return { success: true, message: `Deleted sticker **${snapshot.name}**`, data: snapshot };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const snap = data as { name: string; url: string | null; tags: string | null; description: string | null } | undefined;
    if (!snap?.url) return { success: false, message: 'Cannot re-create sticker — original image unavailable' };
    try {
      const response = await fetch(snap.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const sticker = await guild.stickers.create({
        file: buffer,
        name: snap.name,
        tags: snap.tags ?? snap.name,
        description: snap.description ?? undefined,
        reason: 'Rollback of delete_sticker',
      });
      return { success: true, message: `Rolled back — recreated sticker ${sticker.name}` };
    } catch (error) {
      return { success: false, message: `Rollback failed: ${error instanceof Error ? error.message : 'unknown error'}` };
    }
  }
}
