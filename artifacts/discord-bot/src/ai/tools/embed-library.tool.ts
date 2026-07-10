import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { listTemplates } from './embed-store';
import { listComponentTemplates } from './component-store';
import { listThemes } from './embed-themes';

export class EmbedLibraryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'embed_library',
    description: 'Shows a summary of the embed & component library: all saved embed templates, component templates, and available themes. Use this to browse what\'s available before creating or loading.',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Which section to show: "embeds", "components", "themes", or "all" (default: all)',
          enum: ['embeds', 'components', 'themes', 'all'],
        },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Show the embed library', 'Show available themes in the library'],
  };

  async execute(params: Record<string, unknown>, _guild: Guild): Promise<ToolExecuteResult> {
    const section = String(params['section'] ?? 'all').toLowerCase();
    const lines: string[] = ['📖 **Discord UI Library**\n'];

    if (section === 'all' || section === 'embeds') {
      const templates = await listTemplates();
      lines.push(`**📋 Embed Templates (${templates.length}):**`);
      if (templates.length === 0) {
        lines.push('  _No templates saved yet_');
      } else {
        for (const t of templates.slice(0, 20)) {
          const theme = t.theme ? ` [${t.theme}]` : '';
          const fields = t.data.fields?.length ? ` ${t.data.fields.length}f` : '';
          lines.push(`  • **${t.name}**${theme}${fields}${t.description ? ` — ${t.description}` : ''}`);
        }
        if (templates.length > 20) lines.push(`  _...and ${templates.length - 20} more_`);
      }
      lines.push('');
    }

    if (section === 'all' || section === 'components') {
      const components = await listComponentTemplates();
      lines.push(`**🔘 Component Templates (${components.length}):**`);
      if (components.length === 0) {
        lines.push('  _No component templates saved yet_');
      } else {
        const byType: Record<string, number> = {};
        for (const c of components) { byType[c.type] = (byType[c.type] ?? 0) + 1; }
        for (const [type, count] of Object.entries(byType)) {
          lines.push(`  • ${type}: ${count} template(s)`);
        }
        for (const c of components.slice(0, 10)) {
          lines.push(`    - **${c.name}** [${c.type}]${c.description ? ` — ${c.description}` : ''}`);
        }
      }
      lines.push('');
    }

    if (section === 'all' || section === 'themes') {
      lines.push('**🎨 Available Themes:**');
      lines.push(listThemes());
      lines.push('');
    }

    lines.push('_Use `save_embed_template`, `load_embed_template`, `save_component_template`, or `load_component_template` to manage the library._');

    return { success: true, message: lines.join('\n') };
  }
}
