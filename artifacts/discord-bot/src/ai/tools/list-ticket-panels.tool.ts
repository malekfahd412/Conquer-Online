import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getPanels } from '../../discord/tickets/ticket-store';

export class ListTicketPanelsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_ticket_panels',
    description: 'Lists all configured ticket panels for this server.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['List all ticket panels', 'Show me the ticket panels'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const panels = await getPanels(guild.id);
    if (panels.length === 0) return { success: true, message: 'No ticket panels configured yet.' };
    const lines = panels.map(p => `• \`${p.id}\` — **${p.title}** in <#${p.channelId}> — types: ${p.buttons.map(b => b.ticketType).join(', ')}`);
    return { success: true, message: `🎫 **Ticket Panels (${panels.length})**\n${lines.join('\n')}` };
  }
}
