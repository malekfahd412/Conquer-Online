import { AutoModerationRuleTriggerType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class AutomodAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'automod_analytics',
    description: 'Shows server-wide AutoMod statistics: rule count by trigger type, enabled vs disabled, and total keywords tracked.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show AutoMod analytics'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const rules = await guild.autoModerationRules.fetch();
    if (rules.size === 0) return { success: true, message: 'This server has no AutoMod rules to analyze' };

    const enabled = rules.filter(r => r.enabled).size;
    const disabled = rules.size - enabled;
    const byType = new Map<number, number>();
    let totalKeywords = 0;

    for (const rule of rules.values()) {
      byType.set(rule.triggerType, (byType.get(rule.triggerType) ?? 0) + 1);
      totalKeywords += rule.triggerMetadata.keywordFilter.length;
    }

    const typeLabels: Record<number, string> = {
      [AutoModerationRuleTriggerType.Keyword]: 'Keyword',
      [AutoModerationRuleTriggerType.Spam]: 'Spam',
      [AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
      [AutoModerationRuleTriggerType.MentionSpam]: 'Mention Spam',
      [AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile',
    };
    const breakdown = [...byType.entries()].map(([type, count]) => `• ${typeLabels[type] ?? 'Unknown'}: ${count}`).join('\n');

    return {
      success: true,
      message: `**📊 AutoMod Analytics — ${guild.name}**\n• Total rules: ${rules.size}\n• Enabled: ${enabled} | Disabled: ${disabled}\n• Total keywords tracked: ${totalKeywords}\n\n**By trigger type:**\n${breakdown}`,
      data: { total: rules.size, enabled, disabled, totalKeywords },
    };
  }
}
