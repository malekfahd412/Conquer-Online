import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { renameTemplate, getTemplate } from './embed-store';

export class RenameEmbedTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_embed_template',
    description: 'Renames an existing embed template.',
    parameters: {
      type: 'object',
      properties: {
        old_name: { type: 'string', description: 'Current template name' },
        new_name: { type: 'string', description: 'New template name' },
      },
      required: ['old_name', 'new_name'],
    },
    dangerous: false,
    examples: ['Rename embed template "weekly" to "weekly-update"'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const oldName = String(params['old_name'] ?? '').trim();
    const newName = String(params['new_name'] ?? '').trim();

    if (!oldName || !newName) return { success: false, message: 'Both old_name and new_name are required' };
    if (oldName.toLowerCase() === newName.toLowerCase()) return { success: false, message: 'New name is the same as the old name' };

    const existing = await getTemplate(oldName);
    if (!existing) return { success: false, message: `Template "${oldName}" not found` };

    const conflict = await getTemplate(newName);
    if (conflict) return { success: false, message: `A template named "${newName}" already exists — choose a different name` };

    await renameTemplate(oldName, newName);
    return { success: true, message: `✅ Template renamed: **"${oldName}"** → **"${newName}"**` };
  }
}
