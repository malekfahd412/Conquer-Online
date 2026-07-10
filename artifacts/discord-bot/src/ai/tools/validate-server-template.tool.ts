import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ValidateServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'validate_server_template',
    description: 'Validates a server template: checks if it\'s up to date with the current server, lists what would be included if used to create a new server.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to validate' },
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
      if (!template) return { success: false, message: `Template \`${code}\` not found` };

      const sg = template.serializedGuild;
      const issues: string[] = [];
      const checks: string[] = [];

      if (template.isDirty) issues.push('⚠️ Template is **out of date** — server has changed since last sync. Use `import_server_template` to sync.');
      else checks.push('✅ Template is up to date');

      const chCount = sg?.channels?.length ?? 0;
      const roleCount = sg?.roles?.length ?? 0;
      if (chCount === 0) issues.push('⚠️ No channels in template');
      else checks.push(`✅ ${chCount} channel(s)`);
      if (roleCount === 0) issues.push('⚠️ No roles in template');
      else checks.push(`✅ ${roleCount} role(s)`);

      if (!template.name || template.name.length < 1) issues.push('❌ Template name is empty');
      else if (template.name.length > 100) issues.push(`❌ Name too long (${template.name.length}/100)`);
      else checks.push('✅ Valid name');

      const status = issues.length === 0 ? '✅ Valid' : `⚠️ Has ${issues.length} issue(s)`;

      const lines = [
        `🔍 **Template Validation** — \`${code}\``,
        `Status: **${status}**`,
        `Name: "${template.name}" | Created by: ${template.creator?.username ?? 'Unknown'} | Uses: ${template.usageCount}`,
        '',
        ...checks,
        ...(issues.length > 0 ? ['', '**Issues:**', ...issues] : []),
        '',
        `**Would create:** ${chCount} channel(s), ${roleCount} role(s)`,
        `**Template URL:** https://discord.new/${code}`,
      ];

      return { success: true, message: lines.join('\n') };
    } catch (e: unknown) {
      return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
