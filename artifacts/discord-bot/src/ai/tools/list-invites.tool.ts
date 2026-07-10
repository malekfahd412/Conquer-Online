import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ListInvitesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'list_invites',
    description: 'Lists all active invite links for the server with their channel, uses, and expiry.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
    examples: ['List all invites', 'Show active invite links'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const invites = await guild.invites.fetch();
    if (invites.size === 0) return { success: true, message: 'This server has no active invites' };

    const lines = invites.first(25).map(inv => {
      const expiry = inv.maxAge === 0 ? 'never expires' : inv.expiresTimestamp ? `expires <t:${Math.floor(inv.expiresTimestamp / 1000)}:R>` : 'unknown expiry';
      const uses = `${inv.uses ?? 0}${inv.maxUses ? `/${inv.maxUses}` : ''} uses`;
      return `• \`${inv.code}\` → #${inv.channel?.name ?? 'unknown'} — ${uses}, ${expiry}, by ${inv.inviter?.tag ?? 'unknown'}`;
    });

    return { success: true, message: `**🔗 Active Invites — ${guild.name} (${invites.size})**\n${lines.join('\n')}` };
  }
}
