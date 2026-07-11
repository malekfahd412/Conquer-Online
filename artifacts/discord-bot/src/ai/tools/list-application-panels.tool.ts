import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getApplicationPanels } from '../../discord/applications/application-store';

export class ListApplicationPanelsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_application_panels',
    description: 'Lists all configured application panels for this server.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['List application panels'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panels = await getApplicationPanels(guild.id);
    if (panels.length === 0) return { success: true, message: 'No application panels configured yet.' };
    const lines = panels.map(p => `• \`${p.id}\` — **${p.title}** (${p.roleName}) in <#${p.channelId}> — ${p.questions.length} question(s)`);
    return { success: true, message: `📨 **Application Panels (${panels.length})**\n${lines.join('\n')}` };
  }
}
