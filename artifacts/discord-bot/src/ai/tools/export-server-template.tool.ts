import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { promises as fs } from 'fs';
import path from 'path';

export class ExportServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_server_template',
    description: 'Exports a Discord server template to a JSON file in the data directory, preserving the serialized guild structure.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to export' },
        filename: { type: 'string', description: 'Output filename (default: template_<code>.json)' },
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

      const filename = String(params['filename'] ?? `template_${code}.json`).replace(/\W+/g, '_').replace(/_json$/, '.json');
      const filePath = path.join(process.cwd(), 'data', filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({
        code: template.code,
        name: template.name,
        description: template.description,
        usageCount: template.usageCount,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        serializedGuild: template.serializedGuild,
      }, null, 2), 'utf-8');

      return {
        success: true,
        message: `✅ Template \`${code}\` exported to \`data/${filename}\`\nName: "${template.name}" | Uses: ${template.usageCount}`,
      };
    } catch (e: unknown) {
      return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
