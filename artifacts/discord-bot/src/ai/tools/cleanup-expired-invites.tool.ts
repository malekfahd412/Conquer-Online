import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CleanupExpiredInvitesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'cleanup_expired_invites',
    description: 'Finds and deletes expired or zero-use invites from the server. An invite is considered stale if it has maxUses > 0 and uses >= maxUses, or if it has expiresAt in the past.',
    parameters: {
      type: 'object',
      properties: {
        dry_run: {
          type: 'string',
          description: 'If "true", lists invites that would be deleted without actually deleting them. Default: false',
        },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Permanently deletes expired/exhausted invites. Use dry_run=true to preview first.',
    examples: ['clean up expired invites', 'delete exhausted invites', 'cleanup expired invites dry_run=true'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const dryRun = String(params['dry_run'] ?? 'false').toLowerCase() === 'true';

    let invites;
    try {
      invites = await guild.invites.fetch();
    } catch {
      return { success: false, message: 'Failed to fetch invites. Ensure the bot has MANAGE_GUILD permission.' };
    }

    const now = Date.now();
    const expired = invites.filter(inv => {
      const exhausted = inv.maxUses && inv.maxUses > 0 && inv.uses !== null && inv.uses >= inv.maxUses;
      const pastExpiry = inv.expiresTimestamp && inv.expiresTimestamp < now;
      return exhausted || pastExpiry;
    });

    if (expired.size === 0) {
      return { success: true, message: '✅ No expired or exhausted invites found. All invites are still active.' };
    }

    const lines = [
      `🗑️ **Cleanup Expired Invites** — **${guild.name}**`,
      dryRun ? '_(Dry run — no invites deleted)_' : '',
      '',
      `Found **${expired.size}** expired/exhausted invite(s):`,
    ];

    const deleted: string[] = [];
    const failed: string[] = [];

    for (const [code, inv] of expired) {
      const reason = inv.maxUses && inv.uses !== null && inv.uses >= inv.maxUses
        ? `exhausted (${inv.uses}/${inv.maxUses} uses)`
        : `expired at ${inv.expiresAt?.toISOString()}`;
      lines.push(`  • \`${code}\` — ${reason} — created by ${inv.inviter?.tag ?? 'unknown'}`);

      if (!dryRun) {
        try {
          await inv.delete('Automated cleanup of expired invites');
          deleted.push(code);
        } catch {
          failed.push(code);
        }
      }
    }

    if (!dryRun) {
      lines.push('');
      lines.push(`✅ Deleted: **${deleted.length}** | ❌ Failed: **${failed.length}**`);
      if (failed.length > 0) {
        lines.push(`Failed codes: ${failed.map(c => `\`${c}\``).join(', ')}`);
      }
    } else {
      lines.push('');
      lines.push(`Run without \`dry_run=true\` to delete these **${expired.size}** invite(s).`);
    }

    return { success: true, message: lines.filter(l => l !== null).join('\n').slice(0, 4000) };
  }
}
