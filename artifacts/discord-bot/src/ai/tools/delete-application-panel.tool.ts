import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { deleteApplicationPanel, getApplicationPanel } from '../../discord/applications/application-store';

export class DeleteApplicationPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_application_panel',
    description: 'Deletes an application panel configuration by ID.',
    parameters: {
      type: 'object',
      properties: { panelId: { type: 'string', description: 'The panel ID (from list_application_panels)' } },
      required: ['panelId'],
    },
    dangerous: true,
    dangerDescription: 'Removes the panel configuration. The posted panel message will stop working.',
    examples: ['Delete application panel apanel_123'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panelId = String(params['panelId'] ?? '');
    const panel = await getApplicationPanel(panelId);
    if (!panel || panel.guildId !== guild.id) return { success: false, message: `Panel "${panelId}" not found` };
    await deleteApplicationPanel(panelId);
    return { success: true, message: `🗑️ Application panel \`${panelId}\` deleted.` };
  }
}
