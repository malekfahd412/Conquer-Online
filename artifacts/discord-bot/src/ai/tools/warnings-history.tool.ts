import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getWarnings } from './moderation-store';

export class WarningsHistoryTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'warnings_history',
    description: 'Shows warning history for a specific member, or lists all warnings in the server.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or ID (leave blank for all server warnings)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Show warnings for JohnDoe', 'List all server warnings', 'How many warnings does ToxicUser have?'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    let userId: string | undefined;

    if (query) {
      const members = await guild.members.fetch();
      const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
      if (!member) return { success: false, message: `Member "${params['user']}" not found` };
      userId = member.id;
    }

    const warnings = await getWarnings(guild.id, userId);
    if (warnings.length === 0) {
      return { success: true, message: userId ? 'This member has no warnings.' : 'No warnings found in this server.' };
    }

    const lines = warnings.slice(0, 25).map(w =>
      `• \`${w.id}\` — <@${w.userId}> — **${w.reason}** — <t:${Math.floor(w.timestamp / 1000)}:R>`,
    );

    const header = userId ? `**⚠️ Warnings for <@${userId}> (${warnings.length}):**` : `**⚠️ Server Warnings (${warnings.length}):**`;
    return { success: true, message: `${header}\n${lines.join('\n')}` };
  }
}
