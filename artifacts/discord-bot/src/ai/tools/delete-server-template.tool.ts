import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_server_template',
    description: 'Permanently deletes a server template.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to delete' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['code', 'confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: '⚠️ Deleting a server template requires `confirm: "CONFIRM"`' };
    }
    const code = String(params['code'] ?? '').trim();
    try {
      const templates = await guild.fetchTemplates();
      const template = templates.get(code);
      if (!template) return { success: false, message: `Template \`${code}\` not found` };
      const name = template.name;
      await template.delete();
      return { success: true, message: `🗑️ Server template **"${name}"** (\`${code}\`) permanently deleted.` };
    } catch (e: unknown) {
      return { success: false, message: `Failed to delete template: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
