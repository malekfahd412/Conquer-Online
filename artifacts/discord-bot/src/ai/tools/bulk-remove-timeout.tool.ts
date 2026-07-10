import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkRemoveTimeoutTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_remove_timeout',
    description: 'Removes active timeouts from multiple members — all currently timed-out members, or by role/user list.',
    parameters: {
      type: 'object',
      properties: {
        all_timed_out: { type: 'string', description: 'Set to "true" to remove timeouts from ALL currently timed-out members' },
        role: { type: 'string', description: 'Role name — remove timeouts from members with this role' },
        users: { type: 'string', description: 'Comma-separated usernames or IDs' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Remove timeout from all timed-out members', 'Un-timeout all Trial role members'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const reason = String(params['reason'] ?? 'Bulk timeout removal');
    const members = await guild.members.fetch();

    let targets = members.filter(() => false);

    if (String(params['all_timed_out'] ?? '') === 'true') {
      targets = members.filter(m => !!m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now());
    }

    const roleName = String(params['role'] ?? '').toLowerCase().trim();
    if (roleName) {
      const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
      if (!role) return { success: false, message: `Role "${params['role']}" not found` };
      targets = targets.concat(members.filter(m => m.roles.cache.has(role.id) && !!m.communicationDisabledUntilTimestamp));
    }

    const usersRaw = String(params['users'] ?? '');
    if (usersRaw) {
      const queries = usersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const extra = members.filter(m => queries.some(q => m.id === q || m.user.username.toLowerCase() === q));
      targets = targets.concat(extra);
    }

    if (targets.size === 0) return { success: true, message: 'No timed-out members found matching the criteria.' };

    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      try { await m.disableCommunicationUntil(null, reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Bulk Remove Timeout:** ${success} cleared, ${failed} failed` };
  }
}
