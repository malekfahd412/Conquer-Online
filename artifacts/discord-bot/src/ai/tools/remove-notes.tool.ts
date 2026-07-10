import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { removeNote } from './moderation-store';

export class RemoveNotesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'remove_notes',
    description: 'Removes a specific moderator note by note ID. Use moderator_notes to find IDs.',
    parameters: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'The note ID to remove' },
      },
      required: ['note_id'],
    },
    dangerous: false,
    examples: ['Remove note n_123456_abc'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const noteId = String(params['note_id'] ?? '').trim();
    if (!noteId) return { success: false, message: 'Note ID is required' };

    const removed = await removeNote(guild.id, noteId);
    if (!removed) return { success: false, message: `Note \`${noteId}\` not found` };

    return { success: true, message: `✅ Note \`${noteId}\` removed` };
  }
}
