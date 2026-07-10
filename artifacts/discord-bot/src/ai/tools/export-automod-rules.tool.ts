import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ExportAutomodRulesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_automod_rules',
    description: 'Exports all AutoMod rules as portable JSON (name, trigger type, keywords, actions) for backup or import into another server.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Export all AutoMod rules'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const rules = await guild.autoModerationRules.fetch();
    if (rules.size === 0) return { success: true, message: 'This server has no AutoMod rules to export' };

    const exported = rules.map(r => ({
      name: r.name,
      triggerType: r.triggerType,
      enabled: r.enabled,
      keywordFilter: r.triggerMetadata.keywordFilter,
      allowList: r.triggerMetadata.allowList,
      presets: r.triggerMetadata.presets,
      mentionTotalLimit: r.triggerMetadata.mentionTotalLimit,
      regexPatterns: r.triggerMetadata.regexPatterns,
      actionTypes: r.actions.map(a => a.type),
    }));

    return {
      success: true,
      message: `Exported ${exported.length} AutoMod rule(s):\n\`\`\`json\n${JSON.stringify(exported, null, 2).slice(0, 1500)}\n\`\`\``,
      data: exported,
    };
  }
}
