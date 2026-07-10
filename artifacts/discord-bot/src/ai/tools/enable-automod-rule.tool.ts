import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EnableAutomodRuleTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'enable_automod_rule',
    description: 'Enables a disabled AutoMod rule.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule to enable' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Enable the "Keyword Filter" AutoMod rule'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    if (!name) return { success: false, message: 'Rule name is required' };

    const rules = await guild.autoModerationRules.fetch();
    const rule = rules.find(r => r.name.toLowerCase() === name);
    if (!rule) return { success: false, message: `AutoMod rule "${params['name']}" not found` };
    if (rule.enabled) return { success: true, message: `AutoMod rule **${rule.name}** is already enabled` };

    await rule.setEnabled(true);
    return { success: true, message: `Enabled AutoMod rule **${rule.name}**` };
  }
}
