import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { applicationService } from '../../discord/applications/application.service';

export class ApplicationsDashboardTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'applications_dashboard',
    description: 'Shows application statistics: pending, accepted, and rejected counts.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show application stats', 'Applications dashboard'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const stats = await applicationService.dashboardStats(guild.id);
    return {
      success: true,
      message: `📨 **Applications Dashboard**\n• Pending: ${stats.pending}\n• Accepted: ${stats.accepted}\n• Rejected: ${stats.rejected}`,
    };
  }
}
