import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

/**
 * Covers "Keyword Lists", "Whitelist" and "Blacklist" management by editing
 * an existing rule's keywordFilter / allowList arrays.
 */
export class EditAutomodRuleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'edit_automod_rule',
    description: 'Edits an existing AutoMod rule\'s keyword blacklist, allow-list (whitelist), or exempt roles.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule to edit' },
        addKeywords: { type: 'string', description: 'Comma-separated keywords to add to the blacklist (optional)' },
        removeKeywords: { type: 'string', description: 'Comma-separated keywords to remove from the blacklist (optional)' },
        addAllowList: { type: 'string', description: 'Comma-separated keywords to add to the whitelist/allow-list (optional)' },
        removeAllowList: { type: 'string', description: 'Comma-separated keywords to remove from the whitelist (optional)' },
        addExemptRoleNames: { type: 'string', description: 'Comma-separated role names to exempt from this rule (optional)' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Add "casino" to the blacklist of "Keyword Filter"', 'Whitelist "hello" on the profanity rule'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Rule name is required' };

    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: `AutoMod rule "${params['name']}" not found` };

    const before = { keywordFilter: [...rule.triggerMetadata.keywordFilter], allowList: [...rule.triggerMetadata.allowList] };

    let keywordFilter = new Set(rule.triggerMetadata.keywordFilter);
    let allowList = new Set(rule.triggerMetadata.allowList);

    if (params['addKeywords']) String(params['addKeywords']).split(',').map(k => k.trim()).filter(Boolean).forEach(k => keywordFilter.add(k));
    if (params['removeKeywords']) String(params['removeKeywords']).split(',').map(k => k.trim()).filter(Boolean).forEach(k => keywordFilter.delete(k));
    if (params['addAllowList']) String(params['addAllowList']).split(',').map(k => k.trim()).filter(Boolean).forEach(k => allowList.add(k));
    if (params['removeAllowList']) String(params['removeAllowList']).split(',').map(k => k.trim()).filter(Boolean).forEach(k => allowList.delete(k));

    const exemptRoleIds = [...rule.exemptRoles.keys()];
    if (params['addExemptRoleNames']) {
      const names = String(params['addExemptRoleNames']).split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
      for (const roleName of names) {
        const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
        if (role && !exemptRoleIds.includes(role.id)) exemptRoleIds.push(role.id);
      }
    }

    await rule.edit({
      triggerMetadata: { keywordFilter: [...keywordFilter], allowList: [...allowList] },
      exemptRoles: exemptRoleIds,
    });

    return { success: true, message: `Updated AutoMod rule **${rule.name}** — ${keywordFilter.size} blocked, ${allowList.size} allowed`, data: before };
  }

  async rollback(params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const before = data as { keywordFilter: string[]; allowList: string[] };
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: 'Cannot roll back — rule no longer exists' };
    await rule.edit({ triggerMetadata: { keywordFilter: before.keywordFilter, allowList: before.allowList } });
    return { success: true, message: 'Rolled back — restored previous keyword/allow lists' };
  }
}
