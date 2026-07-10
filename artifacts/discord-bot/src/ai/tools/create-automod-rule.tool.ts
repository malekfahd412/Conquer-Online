import {
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  ChannelType,
} from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const PRESET_MAP: Record<string, AutoModerationRuleKeywordPresetType> = {
  profanity: AutoModerationRuleKeywordPresetType.Profanity,
  sexual_content: AutoModerationRuleKeywordPresetType.SexualContent,
  slurs: AutoModerationRuleKeywordPresetType.Slurs,
};

/**
 * Generic AutoMod rule creator — covers every native trigger type Discord supports
 * (keyword, keyword-preset, mention-spam, spam, and link/invite blocking via regex),
 * avoiding duplicate near-identical tools for each rule "flavor".
 */
export class CreateAutomodRuleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_automod_rule',
    description:
      'Creates a Discord AutoMod rule. Supports: keyword filtering (custom words/phrases), keyword presets (profanity, sexual_content, slurs), mention spam limits, built-in spam detection, and link/invite blocking via regex patterns.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the rule' },
        triggerType: {
          type: 'string',
          description: 'One of: keyword, preset, mention_spam, spam, invite_block, link_block',
          enum: ['keyword', 'preset', 'mention_spam', 'spam', 'invite_block', 'link_block'],
        },
        keywords: { type: 'string', description: 'Comma-separated list of keywords/phrases (for triggerType=keyword)' },
        preset: { type: 'string', description: 'Preset name for triggerType=preset: profanity, sexual_content, or slurs' },
        allowList: { type: 'string', description: 'Comma-separated list of exempt words/phrases (optional)' },
        mentionLimit: { type: 'string', description: 'Max mentions allowed per message (for triggerType=mention_spam, default 5)' },
        blockMessage: { type: 'string', description: '"true" to block the offending message (default true)' },
        alertChannelName: { type: 'string', description: 'Text channel to post AutoMod alerts to (optional)' },
        timeoutSeconds: { type: 'string', description: 'Seconds to timeout the member when triggered (optional, max 2419200)' },
        exemptRoleNames: { type: 'string', description: 'Comma-separated role names exempt from this rule (optional)' },
      },
      required: ['name', 'triggerType'],
    },
    dangerous: false,
    examples: [
      'Create a keyword AutoMod rule blocking "scam" and "free nitro"',
      'Create a preset AutoMod rule blocking profanity',
      'Create a mention spam rule limiting to 5 mentions per message',
      'Create a rule blocking Discord invite links',
    ],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim();
    const triggerType = String(params['triggerType'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Rule name is required' };

    const blockMessage = String(params['blockMessage'] ?? 'true').toLowerCase() !== 'false';
    const actions: { type: AutoModerationActionType; metadata?: Record<string, unknown> }[] = [];
    if (blockMessage) actions.push({ type: AutoModerationActionType.BlockMessage });

    if (params['alertChannelName']) {
      const alertChannelName = String(params['alertChannelName']).trim().toLowerCase();
      const alertChannel = guild.channels.cache.find(
        c => c.name.toLowerCase() === alertChannelName && c.type === ChannelType.GuildText,
      ) as TextChannel | undefined;
      if (!alertChannel) return { success: false, message: `Alert channel "${alertChannelName}" not found` };
      actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channelId: alertChannel.id } });
    }

    if (params['timeoutSeconds']) {
      const seconds = Math.min(2_419_200, Math.max(1, parseInt(String(params['timeoutSeconds']), 10) || 0));
      if (seconds > 0) actions.push({ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: seconds } });
    }

    if (actions.length === 0) return { success: false, message: 'At least one action (block/alert/timeout) is required' };

    const exemptRoles = params['exemptRoleNames']
      ? String(params['exemptRoleNames']).split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
      : [];
    const exemptRoleIds = exemptRoles.length
      ? guild.roles.cache.filter(r => exemptRoles.includes(r.name.toLowerCase())).map(r => r.id)
      : [];

    const allowList = params['allowList']
      ? String(params['allowList']).split(',').map(k => k.trim()).filter(Boolean)
      : [];

    try {
      switch (triggerType) {
        case 'keyword': {
          const keywordFilter = params['keywords'] ? String(params['keywords']).split(',').map(k => k.trim()).filter(Boolean) : [];
          if (keywordFilter.length === 0) return { success: false, message: 'At least one keyword is required for triggerType=keyword' };
          const rule = await guild.autoModerationRules.create({
            name,
            eventType: 1,
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: { keywordFilter, allowList },
            actions,
            exemptRoles: exemptRoleIds,
            enabled: true,
          });
          return { success: true, message: `Created keyword AutoMod rule **${rule.name}** blocking: ${keywordFilter.join(', ')}`, data: { id: rule.id } };
        }

        case 'preset': {
          const presetKey = String(params['preset'] ?? '').trim().toLowerCase();
          const preset = PRESET_MAP[presetKey];
          if (!preset) return { success: false, message: 'preset must be one of: profanity, sexual_content, slurs' };
          const rule = await guild.autoModerationRules.create({
            name,
            eventType: 1,
            triggerType: AutoModerationRuleTriggerType.KeywordPreset,
            triggerMetadata: { presets: [preset], allowList },
            actions,
            exemptRoles: exemptRoleIds,
            enabled: true,
          });
          return { success: true, message: `Created preset AutoMod rule **${rule.name}** (${presetKey})`, data: { id: rule.id } };
        }

        case 'mention_spam': {
          const mentionLimit = Math.max(1, parseInt(String(params['mentionLimit'] ?? '5'), 10) || 5);
          const rule = await guild.autoModerationRules.create({
            name,
            eventType: 1,
            triggerType: AutoModerationRuleTriggerType.MentionSpam,
            triggerMetadata: { mentionTotalLimit: mentionLimit },
            actions,
            exemptRoles: exemptRoleIds,
            enabled: true,
          });
          return { success: true, message: `Created mention-spam AutoMod rule **${rule.name}** (limit: ${mentionLimit})`, data: { id: rule.id } };
        }

        case 'spam': {
          const rule = await guild.autoModerationRules.create({
            name,
            eventType: 1,
            triggerType: AutoModerationRuleTriggerType.Spam,
            actions,
            exemptRoles: exemptRoleIds,
            enabled: true,
          });
          return { success: true, message: `Created built-in spam-detection AutoMod rule **${rule.name}**`, data: { id: rule.id } };
        }

        case 'invite_block': {
          const rule = await guild.autoModerationRules.create({
            name,
            eventType: 1,
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: { regexPatterns: ['discord\\.gg\\/\\S+', 'discord(app)?\\.com\\/invite\\/\\S+'], allowList },
            actions,
            exemptRoles: exemptRoleIds,
            enabled: true,
          });
          return { success: true, message: `Created invite-blocking AutoMod rule **${rule.name}**`, data: { id: rule.id } };
        }

        case 'link_block': {
          const rule = await guild.autoModerationRules.create({
            name,
            eventType: 1,
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: { regexPatterns: ['https?:\\/\\/\\S+'], allowList },
            actions,
            exemptRoles: exemptRoleIds,
            enabled: true,
          });
          return { success: true, message: `Created link-blocking AutoMod rule **${rule.name}**`, data: { id: rule.id } };
        }

        default:
          return { success: false, message: 'triggerType must be one of: keyword, preset, mention_spam, spam, invite_block, link_block' };
      }
    } catch (error) {
      return { success: false, message: `Failed to create AutoMod rule: ${error instanceof Error ? error.message : 'unknown error'}` };
    }
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { id } = (data as { id: string }) ?? {};
    const rule = id ? await guild.autoModerationRules.fetch(id).catch(() => undefined) : undefined;
    if (!rule) return { success: true, message: 'Rule already gone' };
    await rule.delete('Rollback of create_automod_rule');
    return { success: true, message: `Rolled back — deleted AutoMod rule ${rule.name}` };
  }
}
