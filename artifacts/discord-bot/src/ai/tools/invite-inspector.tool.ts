import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class InviteInspectorTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'invite_inspector',
    description: 'Shows full details for a specific invite code: creator, channel, uses, expiry, and creation date.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Invite code to inspect (e.g. "aBcDeF")' },
      },
      required: ['code'],
    },
    dangerous: false,
    examples: ['Inspect invite code "aBcDeF"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const code = String(params['code'] ?? '').trim();
    if (!code) return { success: false, message: 'Invite code is required' };

    const invites = await guild.invites.fetch();
    const invite = invites.get(code);
    if (!invite) return { success: false, message: `Invite "${code}" not found` };

    const created = invite.createdTimestamp ? `<t:${Math.floor(invite.createdTimestamp / 1000)}:R>` : 'Unknown';
    const expiry = invite.maxAge === 0 ? 'Never' : invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : 'Unknown';

    return {
      success: true,
      message: `**🔍 Invite \`${invite.code}\`**\n• URL: ${invite.url}\n• Channel: #${invite.channel?.name ?? 'unknown'}\n• Creator: ${invite.inviter?.tag ?? 'Unknown'}\n• Uses: ${invite.uses ?? 0}${invite.maxUses ? `/${invite.maxUses}` : ' (unlimited)'}\n• Created: ${created}\n• Expires: ${expiry}`,
      data: { code: invite.code, uses: invite.uses, maxUses: invite.maxUses, channelId: invite.channelId },
    };
  }
}
