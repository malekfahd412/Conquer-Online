import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class InviteAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'invite_analytics',
    description: 'Shows server-wide invite statistics: total invites, total uses, top inviters, and expiring soon.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['Show invite analytics', 'Who has invited the most people?'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const invites = await guild.invites.fetch();
    if (invites.size === 0) return { success: true, message: 'This server has no active invites to analyze' };

    const totalUses = invites.reduce((sum, inv) => sum + (inv.uses ?? 0), 0);

    const byInviter = new Map<string, number>();
    for (const inv of invites.values()) {
      const key = inv.inviter?.tag ?? 'Unknown';
      byInviter.set(key, (byInviter.get(key) ?? 0) + (inv.uses ?? 0));
    }
    const topInviters = [...byInviter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const now = Date.now();
    const expiringSoon = invites.filter(inv => inv.expiresTimestamp && inv.expiresTimestamp - now < 86_400_000).size;

    const inviterLines = topInviters.map(([tag, uses], i) => `${i + 1}. **${tag}** — ${uses} use${uses === 1 ? '' : 's'}`);

    return {
      success: true,
      message: `**📊 Invite Analytics — ${guild.name}**\n• Active invites: ${invites.size}\n• Total uses: ${totalUses}\n• Expiring within 24h: ${expiringSoon}\n\n**Top inviters:**\n${inviterLines.join('\n') || 'None'}`,
      data: { totalInvites: invites.size, totalUses, expiringSoon, topInviters },
    };
  }
}
