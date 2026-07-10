import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { addWarning } from './moderation-store';

export class AddWarningTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'add_warning',
    description: 'Issues a formal warning to a member. Warnings are stored persistently and visible in the warnings history.',
    parameters: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Username, display name, or user ID' },
        reason: { type: 'string', description: 'Reason for the warning' },
        moderator: { type: 'string', description: 'Username or ID of the moderator issuing the warning (optional)' },
      },
      required: ['user', 'reason'],
    },
    dangerous: false,
    examples: ['Warn JohnDoe for spamming', 'Issue warning to ToxicUser for rule violation #3'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const query = String(params['user'] ?? '').toLowerCase().trim();
    const reason = String(params['reason'] ?? '').trim();
    if (!reason) return { success: false, message: 'Warning reason is required' };

    const members = await guild.members.fetch();
    const member = members.find(m => m.id === query || m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query);
    if (!member) return { success: false, message: `Member "${params['user']}" not found` };

    const modQuery = String(params['moderator'] ?? '').toLowerCase().trim();
    const mod = modQuery ? members.find(m => m.id === modQuery || m.user.username.toLowerCase() === modQuery) : null;

    const warning = await addWarning({
      userId: member.id,
      guildId: guild.id,
      reason,
      moderatorId: mod?.id ?? 'system',
    });

    const existing = (await import('./moderation-store')).getWarnings(guild.id, member.id);
    const count = (await existing).length;

    return {
      success: true,
      message: `⚠️ **Warning issued** to **${member.displayName}**\n• Reason: ${reason}\n• Warning ID: \`${warning.id}\`\n• Total warnings: **${count}**`,
    };
  }
}
