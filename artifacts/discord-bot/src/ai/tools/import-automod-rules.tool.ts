import { AutoModerationRuleTriggerType, AutoModerationActionType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface ImportRuleRecord {
  name: string;
  triggerType: AutoModerationRuleTriggerType;
  keywordFilter?: string[];
  allowList?: string[];
  presets?: number[];
  mentionTotalLimit?: number;
  regexPatterns?: string[];
}

export class ImportAutomodRulesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'import_automod_rules',
    description: 'Imports AutoMod rules from a JSON array of rule records (as produced by export_automod_rules). Every imported rule defaults to a Block Message action.',
    parameters: {
      type: 'object',
      properties: {
        rulesJson: { type: 'string', description: 'JSON array string of AutoMod rule records' },
      },
      required: ['rulesJson'],
    },
    dangerous: false,
    examples: ['Import this AutoMod rules JSON export'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    let records: ImportRuleRecord[];
    try {
      records = JSON.parse(String(params['rulesJson'] ?? '[]')) as ImportRuleRecord[];
    } catch {
      return { success: false, message: 'rulesJson is not valid JSON' };
    }
    if (!Array.isArray(records) || records.length === 0) return { success: false, message: 'No rule records to import' };

    const existing = await guild.autoModerationRules.fetch();
    const created: string[] = [];
    const skipped: string[] = [];

    for (const record of records.slice(0, 10)) {
      const name = String(record?.name ?? '').trim();
      if (!name) { skipped.push('(invalid record)'); continue; }
      if (existing.some(r => r.name.toLowerCase() === name.toLowerCase())) { skipped.push(name); continue; }

      try {
        const rule = await guild.autoModerationRules.create({
          name,
          eventType: 1,
          triggerType: record.triggerType,
          triggerMetadata: {
            keywordFilter: record.keywordFilter ?? [],
            allowList: record.allowList ?? [],
            presets: record.presets ?? [],
            mentionTotalLimit: record.mentionTotalLimit,
            regexPatterns: record.regexPatterns ?? [],
          },
          actions: [{ type: AutoModerationActionType.BlockMessage }],
          enabled: true,
        });
        created.push(rule.name);
      } catch {
        skipped.push(name);
      }
    }

    return {
      success: created.length > 0,
      message: `Imported ${created.length} AutoMod rule(s)${created.length ? `: ${created.join(', ')}` : ''}${skipped.length ? `. Skipped: ${skipped.join(', ')}` : ''}`,
      data: { created, skipped },
    };
  }
}
