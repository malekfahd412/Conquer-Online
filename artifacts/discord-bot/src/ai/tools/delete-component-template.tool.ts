import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { deleteComponentTemplate, getComponentTemplate } from './component-store';

export class DeleteComponentTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_component_template',
    description: 'Permanently deletes a saved component or modal template by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently removes the component template.',
    examples: ['Delete component template "old-verify-buttons"'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    if (!name) return { success: false, message: 'Template name is required' };

    const existing = await getComponentTemplate(name);
    if (!existing) return { success: false, message: `Component template "${name}" not found` };

    await deleteComponentTemplate(name);
    return { success: true, message: `🗑️ Component template **"${name}"** [${existing.type}] has been deleted` };
  }
}
