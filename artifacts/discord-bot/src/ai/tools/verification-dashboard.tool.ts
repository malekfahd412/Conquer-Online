import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { verificationService } from '../../discord/verification/verification.service';

export class VerificationDashboardTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'verification_dashboard',
    description: 'Shows verification statistics: pending, verified, and rejected counts.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show verification dashboard', 'Verification stats'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const stats = await verificationService.dashboardStats(guild.id);
    return {
      success: true,
      message: `✅ **Verification Dashboard**\n• Pending: ${stats.pending}\n• Verified: ${stats.verified}\n• Rejected: ${stats.rejected}`,
    };
  }
}
