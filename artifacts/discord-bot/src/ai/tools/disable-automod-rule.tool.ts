import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DisableAutomodRuleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'disable_automod_rule',
    description: 'Disables an active AutoMod rule without deleting it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule to disable' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Disable the "Keyword Filter" AutoMod rule'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Rule name is required' };

    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: `AutoMod rule "${params['name']}" not found` };
    if (!rule.enabled) return { success: true, message: `AutoMod rule **${rule.name}** is already disabled` };

    await rule.setEnabled(false);
    return { success: true, message: `Disabled AutoMod rule **${rule.name}**` };
  }

  async rollback(params: Record<string, unknown>, _data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: 'Cannot roll back — rule no longer exists' };
    await rule.setEnabled(true);
    return { success: true, message: `Rolled back — re-enabled rule ${rule.name}` };
  }
}
