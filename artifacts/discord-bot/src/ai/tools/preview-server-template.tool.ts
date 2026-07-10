import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PreviewServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'preview_server_template',
    description: 'Shows a preview of a server template: what channels and roles it would create, the template URL, and usage statistics.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to preview' },
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
      if (!template) return { success: false, message: `Template \`${code}\` not found in **${guild.name}**` };

      const sg = template.serializedGuild;
      const channels = sg?.channels ?? [];
      const roles = sg?.roles ?? [];

      const lines = [
        `🔮 **Template Preview** — "${template.name}"`,
        `Code: \`${code}\` | URL: https://discord.new/${code}`,
        `Uses: ${template.usageCount} | ✅ Active`,
        template.description ? `"${template.description}"` : '',
        '',
        `**Would create ${channels.length} channel(s):**`,
      ];

      for (const ch of channels.slice(0, 20)) {
        const icon = ch.type === 4 ? '📁' : ch.type === 2 ? '🔊' : '#';
        const parent = ch.parent_id ? channels.find(c => c.id === ch.parent_id)?.name : null;
        lines.push(`  ${icon} ${ch.name}${parent ? ` (in ${parent})` : ''}`);
      }
      if (channels.length > 20) lines.push(`  _...and ${channels.length - 20} more_`);

      lines.push('', `**Would create ${roles.length} role(s):**`);
      for (const r of roles.slice(0, 10)) {
        if (r.name === '@everyone') continue;
        const color = r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'no color';
        lines.push(`  🎭 ${r.name} | ${color}`);
      }
      if (roles.length > 10) lines.push(`  _...and ${roles.length - 10} more_`);

      return { success: true, message: lines.filter(Boolean).join('\n').slice(0, 4000) };
    } catch (e: unknown) {
      return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
