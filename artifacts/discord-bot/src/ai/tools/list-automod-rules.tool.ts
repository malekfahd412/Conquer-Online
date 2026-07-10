import { AutoModerationRuleTriggerType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const TRIGGER_LABELS: Record<number, string> = {
  [AutoModerationRuleTriggerType.Keyword]: 'Keyword',
  [AutoModerationRuleTriggerType.Spam]: 'Spam',
  [AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
  [AutoModerationRuleTriggerType.MentionSpam]: 'Mention Spam',
  [AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile',
};

export class ListAutomodRulesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_automod_rules',
    description: 'Lists all AutoMod rules configured for the server, with their trigger type and enabled status.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['List all AutoMod rules', 'Show moderation rules'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const rules = await guild.autoModerationRules.fetch();
    if (rules.size === 0) return { success: true, message: 'This server has no AutoMod rules configured' };

    const lines = rules.map(r => `• **${r.name}** — ${TRIGGER_LABELS[r.triggerType] ?? 'Unknown'} — ${r.enabled ? '✅ Enabled' : '⏸️ Disabled'}`);
    return { success: true, message: `**🛡️ AutoMod Rules — ${guild.name} (${rules.size})**\n${lines.join('\n')}` };
  }
}
