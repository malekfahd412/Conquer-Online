import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getWarnings, getNotes } from './moderation-store';

export class MemberHistoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'member_history',
    description: 'Shows a full moderation history for a member: join date, roles, warnings, and notes.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
      },
      required: ['user'],
    },
    dangerous: false,
    examples: ['Show moderation history for JohnDoe', 'What is the history of ToxicUser?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const members = await guild.members.fetch();
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    const warnings = await getWarnings(guild.id, member.id);
    const notes = await getNotes(guild.id, member.id);

    const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'none';
    const timedOut = member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()
      ? `Yes (until <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>)` : 'No';

    const warnLines = warnings.length > 0
      ? warnings.slice(0, 5).map(w => `  • \`${w.id}\` — ${w.reason} — <t:${Math.floor(w.timestamp / 1000)}:R>`)
      : ['  • None'];

    const noteLines = notes.length > 0
      ? notes.slice(0, 5).map(n => `  • \`${n.id}\` — ${n.content} — <t:${Math.floor(n.timestamp / 1000)}:R>`)
      : ['  • None'];

    const lines = [
      `**📋 Member History — ${member.displayName}**`,
      `• Username: ${member.user.username} (${member.id})`,
      `• Joined: <t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:F>`,
      `• Account created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
      `• Roles (${member.roles.cache.size - 1}): ${roles}`,
      `• Currently timed out: ${timedOut}`,
      `• Bot: ${member.user.bot ? 'Yes' : 'No'}`,
      ``,
      `**⚠️ Warnings (${warnings.length}):**`,
      ...warnLines,
      ``,
      `**📝 Notes (${notes.length}):**`,
      ...noteLines,
    ];

    return { success: true, message: lines.join('\n') };
  }
}
