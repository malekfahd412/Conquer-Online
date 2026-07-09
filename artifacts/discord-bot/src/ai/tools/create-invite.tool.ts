import { ChannelType } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CreateInviteTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_invite',
    description: 'Creates an invite link for a channel.',
    parameters: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Channel to create the invite for' },
        maxAge: { type: 'string', description: 'How long the invite lasts: "1h", "24h", "7d", "30d", or "never" (default: 24h)' },
        maxUses: { type: 'string', description: 'Maximum number of uses (e.g. "10", "100", or "unlimited"). Default: unlimited.' },
      },
      required: ['channelName'],
    },
    dangerous: false,
    examples: ['Create a 24-hour invite link for #welcome', 'Create a permanent invite for #lobby'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channelName = String(params['channelName'] ?? '').trim().toLowerCase();
    if (!channelName) return { success: false, message: 'Channel name is required' };

    const channel = guild.channels.cache.find(
      c => c.name.toLowerCase() === channelName &&
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice),
    ) as GuildChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${channelName}" not found` };

    const maxAgeStr = String(params['maxAge'] ?? '24h').toLowerCase();
    const maxAge = maxAgeStr === 'never' || maxAgeStr === '0' ? 0
      : maxAgeStr.endsWith('d') ? parseInt(maxAgeStr) * 86400
      : maxAgeStr.endsWith('h') ? parseInt(maxAgeStr) * 3600
      : 86400;

    const maxUsesStr = String(params['maxUses'] ?? 'unlimited').toLowerCase();
    const maxUses = maxUsesStr === 'unlimited' || maxUsesStr === '0' ? 0 : parseInt(maxUsesStr);

    const invite = await guild.invites.create(channel.id, { maxAge, maxUses: isNaN(maxUses) ? 0 : maxUses });

    const ageDesc = maxAge === 0 ? 'permanent' : maxAge < 3600 ? `${maxAge / 60}m` : maxAge < 86400 ? `${maxAge / 3600}h` : `${maxAge / 86400}d`;
    const usesDesc = maxUses === 0 ? 'unlimited uses' : `${maxUses} use${maxUses === 1 ? '' : 's'}`;

    return {
      success: true,
      message: `Created invite for **#${channel.name}** — **${invite.url}** (${ageDesc}, ${usesDesc})`,
      data: { url: invite.url, code: invite.code },
    };
  }
}
