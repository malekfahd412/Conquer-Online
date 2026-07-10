import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DuplicateServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'duplicate_server_template',
    description: 'Duplicates a server template by creating a new template with a copy name. Discord templates cannot be directly copied — this creates a new one with a modified name.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to duplicate' },
        new_name: { type: 'string', description: 'Name for the duplicate (default: "Copy of <original name>")' },
      },
      required: ['code'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const code = String(params['code'] ?? '').trim();
    try {
      const templates = await guild.fetchTemplates();
      const template = templates.get(code);
      if (!template) return { success: false, message: `Template \`${code}\` not found` };

      const newName = String(params['new_name'] ?? `Copy of ${template.name}`).slice(0, 100);
      const newTemplate = await guild.createTemplate(newName, template.description ?? undefined);

      return {
        success: true,
        message: `✅ Template duplicated — "${newTemplate.name}"\nNew code: \`${newTemplate.code}\` | URL: https://discord.new/${newTemplate.code}\n\n⚠️ **Note:** Discord does not support direct template copying. A new template was created from the current server state with the new name.`,
        data: { code: newTemplate.code },
      };
    } catch (e: unknown) {
      return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
