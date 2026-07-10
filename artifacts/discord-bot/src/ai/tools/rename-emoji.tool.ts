import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameEmojiTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_emoji',
    description: 'Renames an existing custom emoji.',
    parameters: {
      type: 'object',
      properties: {
        currentName: { type: 'string', description: 'Current name of the emoji (without colons)' },
        newName: { type: 'string', description: 'New name for the emoji' },
      },
      required: ['currentName', 'newName'],
    },
    dangerous: false,
    examples: ['Rename the emoji "oldname" to "newname"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const currentName = String(params['currentName'] ?? '').trim().toLowerCase();
    const newName = String(params['newName'] ?? '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!currentName) return { success: false, message: 'Current emoji name is required' };
    if (!newName || newName.length < 2) return { success: false, message: 'New name must be at least 2 alphanumeric/underscore characters' };

    await guild.emojis.fetch();
    const emoji = guild.emojis.cache.find(e => e.name?.toLowerCase() === currentName);
    if (!emoji) return { success: false, message: `Emoji "${currentName}" not found` };

    const oldName = emoji.name;
    const updated = await emoji.setName(newName);
    return { success: true, message: `Renamed emoji **:${oldName}:** → **:${updated.name}:**`, data: { id: updated.id, oldName } };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id, oldName } = (data as { id: string; oldName: string }) ?? {};
    const emoji = id ? guild.emojis.cache.get(id) : undefined;
    if (!emoji) return { success: false, message: 'Emoji no longer exists — cannot roll back name' };
    await emoji.setName(oldName);
    return { success: true, message: `Rolled back — renamed emoji back to :${oldName}:` };
  }
}
