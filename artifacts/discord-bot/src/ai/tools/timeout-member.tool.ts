import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

function parseDurationMs(duration: string): number {
  let ms = 0;
  const regex = /(\d+)\s*(d|h|m|s)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(duration)) !== null) {
    const val = parseInt(match[1] ?? '0', 10);
    switch ((match[2] ?? 's').toLowerCase()) {
      case 'd': ms += val * 86_400_000; break;
      case 'h': ms += val * 3_600_000; break;
      case 'm': ms += val * 60_000; break;
      case 's': ms += val * 1_000; break;
    }
  }

  return ms;
}

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export class TimeoutMemberTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'timeout_member',
    description: 'Times out a member so they cannot send messages for a duration.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or display name of the member' },
        duration: { type: 'string', description: 'Duration: e.g. 30m, 1h, 2h30m, 1d (max 28d)' },
        reason: { type: 'string', description: 'Reason for the timeout (optional)' },
      },
      required: ['username', 'duration'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const username = String(params['username'] ?? '').trim();
    const durationStr = String(params['duration'] ?? '').trim();
    const reason = params['reason'] ? String(params['reason']) : 'No reason provided';

    const ms = parseDurationMs(durationStr);
    if (ms <= 0) return { success: false, message: 'Invalid duration. Examples: 30m, 1h, 2h30m, 1d' };
    if (ms > MAX_TIMEOUT_MS) return { success: false, message: 'Duration cannot exceed 28 days' };

    const members = await guild.members.search({ query: username, limit: 1 });
    const member = members.first();
    if (!member) return { success: false, message: `Member "${username}" not found` };
    if (!member.moderatable) return { success: false, message: `Cannot timeout **${member.user.tag}** — insufficient permissions` };

    await member.timeout(ms, reason);
    return { success: true, message: `Timed out **${member.user.tag}** for **${durationStr}** — Reason: ${reason}` };
  }
}
