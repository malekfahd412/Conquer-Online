import { AutoModerationRuleTriggerType, AutoModerationActionType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const TRIGGER_LABELS: Record<number, string> = {
  [AutoModerationRuleTriggerType.Keyword]: 'Keyword',
  [AutoModerationRuleTriggerType.Spam]: 'Spam',
  [AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
  [AutoModerationRuleTriggerType.MentionSpam]: 'Mention Spam',
  [AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile',
};

const ACTION_LABELS: Record<number, string> = {
  [AutoModerationActionType.BlockMessage]: 'Block Message',
  [AutoModerationActionType.SendAlertMessage]: 'Send Alert',
  [AutoModerationActionType.Timeout]: 'Timeout',
  [AutoModerationActionType.BlockMemberInteraction]: 'Block Member Interaction',
};

export class AutomodInspectorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'automod_inspector',
    description: 'Shows full configuration details for a specific AutoMod rule: trigger, keywords, actions, and exempt roles.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule to inspect' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Inspect the "Keyword Filter" AutoMod rule'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Rule name is required' };

    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: `AutoMod rule "${params['name']}" not found` };

    const actions = rule.actions.map(a => ACTION_LABELS[a.type] ?? 'Unknown').join(', ') || 'None';
    const keywords = rule.triggerMetadata.keywordFilter.length ? rule.triggerMetadata.keywordFilter.join(', ') : 'None';
    const allowList = rule.triggerMetadata.allowList.length ? rule.triggerMetadata.allowList.join(', ') : 'None';
    const exemptRoles = rule.exemptRoles.size ? [...rule.exemptRoles.values()].map(r => r.name).join(', ') : 'None';

    return {
      success: true,
      message: `**🔍 AutoMod Rule — ${rule.name}**\n• Trigger: ${TRIGGER_LABELS[rule.triggerType] ?? 'Unknown'}\n• Status: ${rule.enabled ? '✅ Enabled' : '⏸️ Disabled'}\n• Keywords: ${keywords}\n• Allow list: ${allowList}\n• Actions: ${actions}\n• Exempt roles: ${exemptRoles}`,
      data: { id: rule.id, enabled: rule.enabled },
    };
  }
}
