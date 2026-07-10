import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class FilterMembersTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'filter_members',
    description: 'Filter members by criteria: role, bot/human, join date range, muted, deafened, or timed-out status.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Filter by role name (optional)' },
        type: { type: 'string', description: 'Filter by type: "humans", "bots", or "all" (default all)', enum: ['humans', 'bots', 'all'] },
        status: { type: 'string', description: 'Filter by status: "muted", "deafened", "timed_out", "in_voice", or "all"', enum: ['muted', 'deafened', 'timed_out', 'in_voice', 'all'] },
        joined_after: { type: 'string', description: 'ISO date — only members who joined after this date (e.g. 2024-01-01)' },
        joined_before: { type: 'string', description: 'ISO date — only members who joined before this date' },
        limit: { type: 'string', description: 'Max results (default 20, max 100)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Filter members with the Moderator role', 'Show all bots', 'Filter timed out members', 'Show members who joined after 2024-01-01'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '20'), 10) || 20));
    const type = String(params['type'] ?? 'all');
    const status = String(params['status'] ?? 'all');
    const roleName = String(params['role'] ?? '').toLowerCase().trim();
    const joinedAfter = params['joined_after'] ? new Date(String(params['joined_after'])).getTime() : null;
    const joinedBefore = params['joined_before'] ? new Date(String(params['joined_before'])).getTime() : null;

    const members = await guild.members.fetch();

    const filtered = members.filter(m => {
      if (type === 'humans' && m.user.bot) return false;
      if (type === 'bots' && !m.user.bot) return false;
      if (roleName && !m.roles.cache.some(r => r.name.toLowerCase().includes(roleName))) return false;
      if (joinedAfter && (m.joinedTimestamp ?? 0) < joinedAfter) return false;
      if (joinedBefore && (m.joinedTimestamp ?? 0) > joinedBefore) return false;
      if (status === 'muted' && !m.voice.serverMute) return false;
      if (status === 'deafened' && !m.voice.serverDeaf) return false;
      if (status === 'timed_out' && !m.communicationDisabledUntilTimestamp) return false;
      if (status === 'in_voice' && !m.voice.channelId) return false;
      return true;
    });

    const list = filtered.first(limit);
    if (list.length === 0) return { success: true, message: 'No members match the specified filters.' };

    const lines = list.map(m => `• **${m.displayName}** (${m.user.username}) — joined <t:${Math.floor((m.joinedTimestamp ?? 0) / 1000)}:D>`);
    const total = filtered.size;
    const showing = Math.min(limit, total);

    return {
      success: true,
      message: `**👥 Filtered Members — ${showing}/${total} shown:**\n${lines.join('\n')}`,
    };
  }
}
