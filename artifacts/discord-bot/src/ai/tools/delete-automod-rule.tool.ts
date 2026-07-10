import { AutoModerationRuleTriggerType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteAutomodRuleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_automod_rule',
    description: 'Permanently deletes an AutoMod rule.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule to delete' },
      },
      required: ['name'],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes the AutoMod rule. This cannot be undone directly (only recreated).',
    examples: ['Delete the "Keyword Filter" AutoMod rule'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Rule name is required' };

    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: `AutoMod rule "${params['name']}" not found` };

    const snapshot = {
      name: rule.name,
      triggerType: rule.triggerType,
      triggerMetadata: { keywordFilter: [...rule.triggerMetadata.keywordFilter], allowList: [...rule.triggerMetadata.allowList], presets: [...rule.triggerMetadata.presets] },
      actions: rule.actions.map(a => ({ type: a.type, metadata: a.metadata })),
      exemptRoles: [...rule.exemptRoles.keys()],
    };

    await rule.delete('Deleted via AI Control Center');
    return { success: true, message: `Deleted AutoMod rule **${snapshot.name}**`, data: snapshot };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const snap = data as {
      name: string;
      triggerType: AutoModerationRuleTriggerType;
      triggerMetadata: { keywordFilter: string[]; allowList: string[]; presets: number[] };
      actions: { type: number; metadata?: Record<string, unknown> }[];
      exemptRoles: string[];
    } | undefined;
    if (!snap) return { success: false, message: 'No snapshot available to roll back' };

    try {
      const rule = await guild.autoModerationRules.create({
        name: snap.name,
        eventType: 1,
        triggerType: snap.triggerType,
        triggerMetadata: snap.triggerType === AutoModerationRuleTriggerType.Keyword || snap.triggerType === AutoModerationRuleTriggerType.KeywordPreset
          ? { keywordFilter: snap.triggerMetadata.keywordFilter, allowList: snap.triggerMetadata.allowList, presets: snap.triggerMetadata.presets }
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actions: snap.actions as any,
        exemptRoles: snap.exemptRoles,
        enabled: true,
      });
      return { success: true, message: `Rolled back — recreated AutoMod rule ${rule.name}` };
    } catch (error) {
      return { success: false, message: `Rollback failed: ${error instanceof Error ? error.message : 'unknown error'}` };
    }
  }
}
