import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { deletePanel, getPanel } from '../../discord/tickets/ticket-store';

export class DeleteTicketPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_ticket_panel',
    description: 'Deletes a ticket panel configuration by ID. Does not affect already-open tickets.',
    parameters: {
      type: 'object',
      properties: { panelId: { type: 'string', description: 'The panel ID (from list_ticket_panels)' } },
      required: ['panelId'],
    },
    dangerous: true,
    dangerDescription: 'Removes the panel configuration. The posted panel message will stop working.',
    examples: ['Delete ticket panel panel_123'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panelId = String(params['panelId'] ?? '');
    const panel = await getPanel(panelId);
    if (!panel || panel.guildId !== guild.id) return { success: false, message: `Panel "${panelId}" not found` };
    await deletePanel(panelId);
    return { success: true, message: `🗑️ Ticket panel \`${panelId}\` deleted.` };
  }
}
