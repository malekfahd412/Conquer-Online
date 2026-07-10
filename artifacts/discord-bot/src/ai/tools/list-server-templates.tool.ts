import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListServerTemplatesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_server_templates',
    description: 'Lists all Discord server templates created from this server.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    try {
      const templates = await guild.fetchTemplates();
      if (templates.size === 0) {
        return { success: true, message: `**${guild.name}** has no server templates. Use \`create_server_template\` to create one.` };
      }

      const lines = [`📋 **Server Templates** — **${guild.name}** (${templates.size})\n`];
      for (const [code, t] of templates) {
        const created = `<t:${Math.floor(t.createdAt.getTime() / 1000)}:D>`;
        const updated = `<t:${Math.floor(t.updatedAt.getTime() / 1000)}:R>`;
        const dirty = t.isDirty ? ' ⚠️ _(out of date)_' : ' ✅';
        lines.push(
          `**${t.name}**${dirty}`,
          `  Code: \`${code}\` | URL: https://discord.new/${code}`,
          `  Created by: ${t.creator?.username ?? 'Unknown'} | Created: ${created} | Updated: ${updated}`,
          `  Uses: ${t.usageCount} | ${t.description ? `"${t.description}"` : '_No description_'}`,
          '',
        );
      }
      return { success: true, message: lines.join('\n').slice(0, 4000) };
    } catch (e: unknown) {
      return { success: false, message: `Failed to fetch templates: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
