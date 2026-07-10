import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ApplyServerTemplateTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'apply_server_template',
    description: 'Applies a Discord template code to the current server. WARNING: This is extremely destructive — it resets all channels and roles to match the template. Requires double confirmation.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Template code to apply' },
        confirm: { type: 'string', description: 'Type "CONFIRM_RESET_SERVER" to acknowledge this will reset all channels and roles' },
      },
      required: ['code', 'confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM_RESET_SERVER') {
      return {
        success: false,
        message: '⛔ **EXTREMELY DESTRUCTIVE:** Applying a template **deletes all existing channels and roles** and replaces them with the template\'s structure.\n\nSet `confirm: "CONFIRM_RESET_SERVER"` only if you are absolutely sure.',
      };
    }
    const code = String(params['code'] ?? '').trim();
    try {
      // Discord.js doesn't expose Guild#applyTemplate directly, but it's available via the REST API
      // We fetch the template first to show what will happen
      const templates = await guild.fetchTemplates();
      const template = templates.get(code);
      const sg = template?.serializedGuild;

      // discord.js v14 does not expose guild.applyTemplate() — this is a REST endpoint
      // We document this limitation
      return {
        success: false,
        message: `⚠️ **Discord API Limitation:** discord.js v14 does not expose a \`guild.applyTemplate()\` method.\n\nThe template \`${code}\` ${template ? `("${template.name}") exists with ${sg?.channels?.length ?? '?'} channels and ${sg?.roles?.length ?? '?'} roles.` : 'was not found in this server\'s templates.'}\n\nTo apply a template to a **new server**, use the URL: https://discord.new/${code}\n\nTo restore structure to this server from a saved backup, use \`restore_server\` instead.`,
      };
    } catch (e: unknown) {
      return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
