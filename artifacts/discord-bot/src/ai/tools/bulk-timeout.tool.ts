import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkTimeoutTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_timeout',
    description: 'Times out multiple members at once — by role or a comma-separated list of usernames/IDs.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Role name — timeout all members with this role' },
        users: { type: 'string', description: 'Comma-separated usernames or IDs to timeout' },
        duration_minutes: { type: 'string', description: 'Timeout duration in minutes (1–40320, default 60)' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: ['duration_minutes'],
    },
    dangerous: true,
    dangerDescription: 'Silences multiple members simultaneously.',
    examples: ['Timeout all Trial members for 10 minutes', 'Timeout users JohnDoe, JaneDoe for 30 minutes for spamming'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const duration = Math.min(40320, Math.max(1, parseInt(String(params['duration_minutes'] ?? '60'), 10) || 60));
    const reason = String(params['reason'] ?? 'Bulk timeout');
    const until = new Date(Date.now() + duration * 60 * 1000);

    const members = await guild.members.fetch();
    let targets = members.filter(() => false);

    const roleName = String(params['role'] ?? '').toLowerCase().trim();
    if (roleName) {
      const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
      if (!role) return { success: false, message: `Role "${params['role']}" not found` };
      targets = members.filter(m => !m.user.bot && m.roles.cache.has(role.id));
    }

    const usersRaw = String(params['users'] ?? '');
    if (usersRaw) {
      const queries = usersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const extra = members.filter(m => queries.some(q => m.id === q || m.user.username.toLowerCase() === q || m.displayName.toLowerCase() === q));
      targets = targets.concat(extra);
    }

    if (targets.size === 0) return { success: false, message: 'No matching members found. Provide a role or users list.' };
    if (targets.size > 50) return { success: false, message: `Too many targets (${targets.size}). Max 50.` };

    const me = guild.members.me;
    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      if (!me || m.roles.highest.position >= me.roles.highest.position) { failed++; continue; }
      try { await m.disableCommunicationUntil(until, reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Bulk Timeout (${duration}min):** ${success} timed out, ${failed} skipped` };
  }
}
