import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ImportServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_server_template',
    description: 'Syncs an existing Discord server template with the current server state, updating it to reflect recent changes.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to sync/update' },
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
      if (!template) return { success: false, message: `Template \`${code}\` not found. Use \`list_server_templates\` to see available templates.` };

      if (!template.isDirty) {
        return { success: true, message: `✅ Template \`${code}\` is already up to date — no sync needed.\nName: "${template.name}"` };
      }

      const synced = await template.sync();
      return {
        success: true,
        message: `🔄 Template \`${code}\` synced with current server state.\nName: "${synced.name}" | Updated: <t:${Math.floor(synced.updatedAt.getTime() / 1000)}:R>`,
      };
    } catch (e: unknown) {
      return { success: false, message: `Failed to sync template: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
