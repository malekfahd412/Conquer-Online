import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { saveComponentTemplate } from './component-store';
import type { ModalConfig, ModalFieldConfig } from './component-store';

export class SaveModalTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'save_modal_template',
    description: 'Saves a Discord modal (popup form) template for reuse. Modals can only be shown in response to an interaction (button click or command) — this tool saves the definition for later use by interaction handlers.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name (unique identifier)' },
        modal_title: { type: 'string', description: 'Modal window title (max 45 chars)' },
        custom_id: { type: 'string', description: 'Modal custom ID for the interaction handler' },
        description: { type: 'string', description: 'Description of what this modal is for' },
        fields_json: {
          type: 'string',
          description: 'JSON array of text input fields. Each: {label, customId, style ("short"|"paragraph"), placeholder?, required?, minLength?, maxLength?}. Max 5 fields. Example: [{"label":"Reason","customId":"reason","style":"paragraph","required":true}]',
        },
      },
      required: ['name', 'modal_title', 'fields_json'],
    },
    dangerous: false,
    examples: [
      'Save a modal template named "ticket-form" with fields for category and description',
      'Save a modal "report-form" with Title and Description fields',
    ],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const modalTitle = String(params['modal_title'] ?? '').trim().slice(0, 45);
    const customId = String(params['custom_id'] ?? `modal_${name}_${Date.now()}`).trim();

    if (!name) return { success: false, message: 'Template name is required' };
    if (!modalTitle) return { success: false, message: 'Modal title is required' };

    let fields: ModalFieldConfig[];
    try {
      fields = JSON.parse(String(params['fields_json'] ?? '[]'));
      if (!Array.isArray(fields) || fields.length === 0) throw new Error('Must define at least one field');
      if (fields.length > 5) return { success: false, message: 'Discord modals support a maximum of 5 fields' };
    } catch (err) {
      return { success: false, message: `Invalid fields_json: ${(err as Error).message}` };
    }

    const modalConfig: ModalConfig = {
      kind: 'modal',
      title: modalTitle,
      customId,
      fields: fields.map(f => ({
        label: String(f.label ?? 'Field').slice(0, 45),
        customId: String(f.customId ?? `field_${Date.now()}`),
        style: f.style === 'paragraph' ? 'paragraph' : 'short',
        placeholder: f.placeholder?.slice(0, 100),
        required: f.required ?? true,
        minLength: f.minLength,
        maxLength: f.maxLength,
      })),
    };

    const t = await saveComponentTemplate({
      name,
      description: params['description'] ? String(params['description']) : undefined,
      type: 'modal',
      component: modalConfig,
    });

    const preview = fields.map((f, i) => `  ${i + 1}. **${f.label}** [${f.style ?? 'short'}${f.required !== false ? ', required' : ''}]`).join('\n');
    return {
      success: true,
      message: `✅ Modal template **"${name}"** saved (ID: \`${t.id}\`)\n**Fields:**\n${preview}\n\n💡 Modals can only appear in response to interactions — use \`list_modal_templates\` to view all saved modals.`,
    };
  }
}
