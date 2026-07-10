import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { duplicateTemplate, getTemplate } from './embed-store';

export class DuplicateEmbedTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'duplicate_embed_template',
    description: 'Creates a copy of an existing embed template under a new name.',
    parameters: {
      type: 'object',
      properties: {
        source_name: { type: 'string', description: 'Name of the template to copy' },
        new_name: { type: 'string', description: 'Name for the new copy' },
      },
      required: ['source_name', 'new_name'],
    },
    dangerous: false,
    examples: ['Duplicate embed template "announcement" as "announcement-v2"'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const sourceName = String(params['source_name'] ?? '').trim();
    const newName = String(params['new_name'] ?? '').trim();

    if (!sourceName || !newName) return { success: false, message: 'Both source_name and new_name are required' };

    const src = await getTemplate(sourceName);
    if (!src) return { success: false, message: `Template "${sourceName}" not found` };

    const conflict = await getTemplate(newName);
    if (conflict) return { success: false, message: `A template named "${newName}" already exists` };

    const copy = await duplicateTemplate(sourceName, newName);
    if (!copy) return { success: false, message: 'Duplication failed' };

    return { success: true, message: `✅ Template **"${sourceName}"** duplicated as **"${newName}"** (ID: \`${copy.id}\`)` };
  }
}
