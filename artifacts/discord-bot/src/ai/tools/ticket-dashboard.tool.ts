import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { ticketSystem } from '../../community/tickets';

export class TicketDashboardTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'ticket_dashboard',
    description: 'Shows ticket statistics: open/closed counts, average response time, and staff claim leaderboard.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show ticket dashboard', 'Ticket stats'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const stats = await ticketSystem.tickets.dashboardStats(guild.id);
    const avgMinutes = (stats.avgResponseMs / 60000).toFixed(1);
    const leaderboard = stats.leaderboard.length
      ? stats.leaderboard.map(([userId, count], i) => `${i + 1}. <@${userId}> — ${count} claimed`).join('\n')
      : '_No claims yet_';

    return {
      success: true,
      message: `📊 **Ticket Dashboard**\n• Total: ${stats.total}\n• Open: ${stats.open}\n• Closed: ${stats.closed}\n• Avg first response: ${avgMinutes} min\n\n**Staff Leaderboard**\n${leaderboard}`,
    };
  }
}
