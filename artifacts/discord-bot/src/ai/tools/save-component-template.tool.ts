import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { saveComponentTemplate } from './component-store';

export class SaveComponentTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'save_component_template',
    description: 'Saves a Discord component layout (buttons, select menus, or a full message with rows) as a named reusable template.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name (unique identifier)' },
        type: {
          type: 'string',
          description: 'Component type: button, string_select, role_select, user_select, channel_select, mentionable_select',
          enum: ['button', 'string_select', 'role_select', 'user_select', 'channel_select', 'mentionable_select'],
        },
        description: { type: 'string', description: 'What this template is for' },
        content: { type: 'string', description: 'Optional message text to send with the component' },
        config_json: {
          type: 'string',
          description: 'JSON configuration for the component. For buttons: {rows:[[{label,style,url?,emoji?},...],...]}, for selects: {placeholder,options:[{label,value,description?}],minValues?,maxValues?}',
        },
      },
      required: ['name', 'type', 'config_json'],
    },
    dangerous: false,
    examples: [
      'Save a component template named "verify-buttons" with a Verify success button',
      'Save a "category-select" string_select template with options Bug, Feature, General',
    ],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const type = String(params['type'] ?? '').trim() as 'button' | 'string_select' | 'role_select' | 'user_select' | 'channel_select' | 'mentionable_select';

    if (!name) return { success: false, message: 'Template name is required' };
    if (!type) return { success: false, message: 'Component type is required' };

    let config: unknown;
    try {
      config = JSON.parse(String(params['config_json'] ?? '{}'));
    } catch {
      return { success: false, message: 'Invalid config_json — must be valid JSON' };
    }

    const t = await saveComponentTemplate({
      name,
      type,
      description: params['description'] ? String(params['description']) : undefined,
      content: params['content'] ? String(params['content']) : undefined,
      rows: (config as { rows?: unknown[] }).rows as never,
      component: type !== 'button' ? config as never : undefined,
    });

    return {
      success: true,
      message: `✅ Component template **"${name}"** [${type}] saved (ID: \`${t.id}\`)\nUse \`load_component_template\` to send it to any channel.`,
    };
  }
}
