import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteEmojiTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_emoji',
    description: 'Deletes a custom emoji from the server by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the emoji to delete (without colons)' },
        reason: { type: 'string', description: 'Reason for the audit log (optional)' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently removes the emoji from the server.',
    examples: ['Delete the emoji named "oldlogo"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Emoji name is required' };

    await guild.emojis.fetch();
    const emoji = guild.emojis.cache.find(e => e.name?.toLowerCase() === name);
    if (!emoji) return { success: false, message: `Emoji "${name}" not found` };

    const snapshot = { id: emoji.id, name: emoji.name, url: emoji.imageURL(), animated: emoji.animated };
    await emoji.delete(params['reason'] ? String(params['reason']) : 'Deleted via AI Control Center');

    return { success: true, message: `Deleted emoji **:${snapshot.name}:**`, data: snapshot };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const snap = data as { name: string; url: string | null } | undefined;
    if (!snap?.url || !snap?.name) return { success: false, message: 'Cannot re-create emoji — original image URL unavailable' };
    const emoji = await guild.emojis.create({ attachment: snap.url, name: snap.name, reason: 'Rollback of delete_emoji' });
    return { success: true, message: `Rolled back — recreated emoji :${emoji.name}:` };
  }
}
