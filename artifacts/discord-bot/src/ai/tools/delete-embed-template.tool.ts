import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { deleteTemplate, getTemplate } from './embed-store';

export class DeleteEmbedTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_embed_template',
    description: 'Permanently deletes a saved embed template by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently removes the template — this cannot be undone.',
    examples: ['Delete embed template "old-announcement"'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Template name is required' };

    const existing = await getTemplate(name);
    if (!existing) return { success: false, message: `Template "${name}" not found` };

    await deleteTemplate(name);
    return { success: true, message: `🗑️ Template **"${name}"** has been deleted` };
  }
}
