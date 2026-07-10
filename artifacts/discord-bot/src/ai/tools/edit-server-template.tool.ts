import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EditServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_server_template',
    description: 'Edits the name or description of an existing server template.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to edit' },
        name: { type: 'string', description: 'New name for the template (max 100 chars)' },
        description: { type: 'string', description: 'New description (max 120 chars, set to empty to clear)' },
      },
      required: ['code'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const code = String(params['code'] ?? '').trim();
    if (!code) return { success: false, message: 'Template code is required' };
    if (!params['name'] && params['description'] === undefined) return { success: false, message: 'Provide at least a new name or description' };

    try {
      const templates = await guild.fetchTemplates();
      const template = templates.get(code);
      if (!template) return { success: false, message: `Template \`${code}\` not found. Use \`list_server_templates\` to see available templates.` };

      const updated = await template.edit({
        name: params['name'] ? String(params['name']).slice(0, 100) : undefined,
        description: params['description'] !== undefined ? String(params['description']).slice(0, 120) : undefined,
      });
      return {
        success: true,
        message: `✅ Template \`${code}\` updated — Name: "${updated.name}" | Description: "${updated.description || 'None'}"`,
      };
    } catch (e: unknown) {
      return { success: false, message: `Failed to edit template: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
