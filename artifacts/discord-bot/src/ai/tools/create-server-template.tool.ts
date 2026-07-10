import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_server_template',
    description: 'Creates a Discord server template from the current server structure (channels, roles, permissions). The template can be used to create new servers.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name (1-100 characters)' },
        description: { type: 'string', description: 'Optional template description (max 120 characters)' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').slice(0, 100).trim();
    if (!name) return { success: false, message: 'Template name is required' };
    const description = params['description'] ? String(params['description']).slice(0, 120) : undefined;

    try {
      const template = await guild.createTemplate(name, description);
      return {
        success: true,
        message: `✅ **Server template created** — "${template.name}"\n` +
          `Code: \`${template.code}\`\n` +
          `URL: https://discord.new/${template.code}\n` +
          `Description: ${template.description || '_None_'}\n` +
          `Channels: ${template.serializedGuild?.channels?.length ?? '?'} | Roles: ${template.serializedGuild?.roles?.length ?? '?'}`,
        data: { code: template.code, url: `https://discord.new/${template.code}` },
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, message: `Failed to create template: ${msg}\n⚠️ Note: Community servers or servers with certain features may not support templates.` };
    }
  }
}
