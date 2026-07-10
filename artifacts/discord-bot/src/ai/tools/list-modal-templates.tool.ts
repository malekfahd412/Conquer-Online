import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listComponentTemplates } from './component-store';
import type { ModalConfig } from './component-store';

export class ListModalTemplatesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_modal_templates',
    description: 'Lists all saved modal (popup form) templates with their fields and configuration.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
    examples: ['List all saved modal templates', 'Show available modal forms'],
  };

  async execute(_params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const templates = await listComponentTemplates('modal');

    if (templates.length === 0) {
      return { success: true, message: '📋 No modal templates saved yet. Use `save_modal_template` to create one.' };
    }

    const lines = [`📋 **Modal Templates (${templates.length}):**\n`];
    for (const t of templates) {
      const modal = t.component as ModalConfig | undefined;
      const updated = new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      lines.push(`• **${t.name}** (ID: \`${t.id}\`) — updated ${updated}`);
      if (t.description) lines.push(`  _${t.description}_`);
      if (modal) {
        lines.push(`  Title: "${modal.title}" | Custom ID: \`${modal.customId}\``);
        lines.push(`  Fields (${modal.fields.length}):`);
        for (const f of modal.fields) {
          lines.push(`    - **${f.label}** [${f.style}${f.required !== false ? ', required' : ''}]${f.placeholder ? ` — "${f.placeholder}"` : ''}`);
        }
      }
      lines.push('');
    }

    lines.push('💡 Modals can only be shown in response to interactions (button clicks, commands) — they cannot be sent directly to a channel.');
    return { success: true, message: lines.join('\n') };
  }
}
