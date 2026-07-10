import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listComponentTemplates } from './component-store';
import type { ComponentType } from './component-store';

export class ListComponentTemplatesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_component_templates',
    description: 'Lists all saved component templates (buttons, select menus, modals) with their type and configuration summary.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by type: button, string_select, role_select, user_select, channel_select, mentionable_select, modal',
          enum: ['button', 'string_select', 'role_select', 'user_select', 'channel_select', 'mentionable_select', 'modal'],
        },
      },
      required: [],
    },
    dangerous: false,
    examples: ['List all component templates', 'List button component templates'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const typeFilter = params['type'] ? String(params['type']) as ComponentType : undefined;
    const templates = await listComponentTemplates(typeFilter);

    if (templates.length === 0) {
      return {
        success: true,
        message: typeFilter
          ? `No ${typeFilter} templates found. Use \`save_component_template\` or \`save_modal_template\` to create one.`
          : '📋 No component templates saved yet.',
      };
    }

    const lines = [`🔘 **Component Templates (${templates.length}):**\n`];
    for (const t of templates) {
      const updated = new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      lines.push(`• **${t.name}** [${t.type}] (ID: \`${t.id}\`) — updated ${updated}${t.description ? `\n  _${t.description}_` : ''}`);
    }

    return { success: true, message: lines.join('\n') };
  }
}
