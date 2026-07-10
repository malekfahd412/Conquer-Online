import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listTemplates } from './embed-store';

export class ListEmbedTemplatesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_embed_templates',
    description: 'Lists all saved embed templates with their names, descriptions, themes, and last-updated timestamps.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter templates by name (optional)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['List all embed templates', 'List embed templates matching "announce"'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    let templates = await listTemplates();
    const search = String(params['search'] ?? '').toLowerCase().trim();
    if (search) templates = templates.filter(t => t.name.toLowerCase().includes(search));

    if (templates.length === 0) {
      return {
        success: true,
        message: search
          ? `No templates found matching "${search}"`
          : '📚 No embed templates saved yet. Use `save_embed_template` to create one.',
      };
    }

    const lines = [`📚 **Embed Templates** (${templates.length}):\n`];
    for (const t of templates) {
      const updated = new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const theme = t.theme ? ` | theme: \`${t.theme}\`` : '';
      const desc = t.description ? `\n  _${t.description}_` : '';
      const fieldCount = t.data.fields?.length ?? 0;
      const fields = fieldCount > 0 ? ` | ${fieldCount} field(s)` : '';
      lines.push(`• **${t.name}** (ID: \`${t.id}\`)${theme}${fields} — updated ${updated}${desc}`);
    }

    return { success: true, message: lines.join('\n') };
  }
}
