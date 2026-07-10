import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkKickTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_kick',
    description: 'Kicks multiple members at once — by role or a comma-separated list of usernames/IDs.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Role name — kick all members with this role' },
        users: { type: 'string', description: 'Comma-separated usernames or IDs to kick' },
        reason: { type: 'string', description: 'Audit log reason' },
      },
      required: ['reason'],
    },
    dangerous: true,
    dangerDescription: 'Permanently removes multiple members from the server.',
    examples: ['Kick all Raider role members for raid', 'Kick users Troll1, Troll2 for rule violations'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const reason = String(params['reason'] ?? 'Bulk kick');
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
    if (targets.size > 25) return { success: false, message: `Too many targets (${targets.size}). Max 25 for bulk kick.` };

    const me = guild.members.me;
    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      if (!me || m.roles.highest.position >= me.roles.highest.position) { failed++; continue; }
      try { await m.kick(reason); success++; } catch { failed++; }
    }

    return { success: true, message: `**Bulk Kick:** ${success} kicked, ${failed} skipped — Reason: ${reason}` };
  }
}
