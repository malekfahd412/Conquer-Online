import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class DeleteInviteTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'delete_invite',
    description: 'Deletes (revokes) an invite by its code.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Invite code to delete (e.g. "aBcDeF")' },
        reason: { type: 'string', description: 'Reason for the audit log (optional)' },
      },
      required: ['code'],
    },
    dangerous: true,
    dangerDescription: 'Immediately revokes the invite link — anyone with it can no longer join.',
    examples: ['Delete invite code "aBcDeF"'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const code = String(params['code'] ?? '').trim();
    if (!code) return { success: false, message: 'Invite code is required' };

    const invites = await guild.invites.fetch();
    const invite = invites.get(code);
    if (!invite) return { success: false, message: `Invite "${code}" not found` };

    const snapshot = { channelId: invite.channelId, maxAge: invite.maxAge ?? 0, maxUses: invite.maxUses ?? 0 };
    await invite.delete(params['reason'] ? String(params['reason']) : 'Deleted via AI Control Center');

    return { success: true, message: `Revoked invite **${code}**`, data: snapshot };
  }

  async rollback(_params: Record<string, unknown>, data: unknown, guild: Guild): Promise<{ success: boolean; message: string }> {
    const { channelId, maxAge, maxUses } = (data as { channelId: string; maxAge: number; maxUses: number }) ?? {};
    if (!channelId) return { success: false, message: 'Cannot roll back — original channel unknown' };
    const invite = await guild.invites.create(channelId, { maxAge, maxUses });
    return { success: true, message: `Rolled back — created a new invite **${invite.url}** for the same channel` };
  }
}
