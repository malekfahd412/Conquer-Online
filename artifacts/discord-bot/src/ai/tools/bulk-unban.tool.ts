import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkUnbanTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_unban',
    description: 'Unbans multiple users at once — all bans, or by comma-separated usernames/IDs from the ban list.',
    parameters: {
      type: 'object',
      properties: {
        users: { type: 'string', description: 'Comma-separated usernames or IDs to unban. Leave blank to unban ALL banned users (requires confirmation).' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: ['reason'],
    },
    dangerous: true,
    dangerDescription: 'Lifts bans for multiple users simultaneously.',
    examples: ['Unban all banned users after amnesty', 'Unban users OldUser1, OldUser2'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const reason = String(params['reason'] ?? 'Bulk unban');
    const usersRaw = String(params['users'] ?? '').trim();
    const bans = await guild.bans.fetch();

    let targets: string[];
    if (!usersRaw) {
      targets = bans.map(b => b.user.id);
    } else {
      const queries = usersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      targets = bans
        .filter(b => queries.some(q => b.user.id === q || b.user.username.toLowerCase() === q))
        .map(b => b.user.id);
    }

    if (targets.length === 0) return { success: true, message: 'No matching banned users found.' };
    if (targets.length > 200) return { success: false, message: `Too many targets (${targets.length}). Specify usernames/IDs to narrow down.` };

    let success = 0; let failed = 0;
    for (const id of targets) {
      try { await guild.members.unban(id, reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Bulk Unban:** ${success} unbanned, ${failed} failed — Reason: ${reason}` };
  }
}
