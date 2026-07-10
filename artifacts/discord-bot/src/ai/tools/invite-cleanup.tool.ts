import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class InviteCleanupTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'invite_cleanup',
    description: 'Bulk-revokes invites that are expired, exhausted (0 uses remaining), or unused (0 uses) — reducing invite link clutter.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: '"unused" (0 uses), "exhausted" (used up all max uses), or "expired" (past expiry). Default: exhausted.' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Permanently revokes every matching invite link.',
    examples: ['Clean up unused invites', 'Remove all exhausted invite links'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const mode = String(params['mode'] ?? 'exhausted').toLowerCase();
    const invites = await guild.invites.fetch();
    const now = Date.now();

    const targets = invites.filter(inv => {
      if (mode === 'unused') return (inv.uses ?? 0) === 0;
      if (mode === 'expired') return !!inv.expiresTimestamp && inv.expiresTimestamp < now;
      return !!inv.maxUses && (inv.uses ?? 0) >= inv.maxUses;
    });

    if (targets.size === 0) return { success: true, message: `No invites matched mode "${mode}"` };

    const removed: string[] = [];
    for (const invite of targets.values()) {
      try {
        await invite.delete('Bulk cleanup via AI Control Center');
        removed.push(invite.code);
      } catch { /* skip */ }
    }

    return { success: removed.length > 0, message: `Cleaned up ${removed.length} invite(s): ${removed.join(', ')}`, data: { removed } };
  }
}
