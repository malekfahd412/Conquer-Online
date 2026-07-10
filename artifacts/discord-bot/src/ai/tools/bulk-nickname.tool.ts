import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BulkNicknameTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'bulk_nickname',
    description: 'Sets a nickname for all members with a specific role, or clears all nicknames in the server.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Role name to target (leave blank to target all non-bot members)' },
        nickname: { type: 'string', description: 'Nickname to set. Use empty string to clear nicknames.' },
        prefix: { type: 'string', description: 'Optional prefix to add before their current display name (alternative to fixed nickname)' },
      },
      required: [],
    },
    dangerous: true,
    dangerDescription: 'Changes nicknames for potentially many members at once.',
    examples: ['Set nickname "🛡️ Guard" for all members with the Guard role', 'Add prefix [VIP] to all VIP role members', 'Clear all nicknames for the Trial role'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const roleName = String(params['role'] ?? '').toLowerCase().trim();
    const nickname = params['nickname'] !== undefined ? String(params['nickname']) : null;
    const prefix = params['prefix'] ? String(params['prefix']) : null;

    const members = await guild.members.fetch();
    let targets = members.filter(m => !m.user.bot);
    if (roleName) {
      const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
      if (!role) return { success: false, message: `Role "${params['role']}" not found` };
      targets = targets.filter(m => m.roles.cache.has(role.id));
    }

    if (targets.size === 0) return { success: false, message: 'No matching members found' };
    if (targets.size > 50) return { success: false, message: `Too many targets (${targets.size}). Narrow down with a role filter. Max 50.` };

    let success = 0;
    let failed = 0;
    const me = guild.members.me;
    for (const m of targets.values()) {
      if (!me || m.roles.highest.position >= me.roles.highest.position) { failed++; continue; }
      try {
        let nick: string | null;
        if (prefix) nick = `${prefix} ${m.user.username}`;
        else if (nickname !== null) nick = nickname || null;
        else nick = null;
        await m.setNickname(nick);
        success++;
      } catch { failed++; }
    }

    return { success: true, message: `**Bulk Nickname:** ${success} updated, ${failed} skipped (insufficient permissions or hierarchy)` };
  }
}
