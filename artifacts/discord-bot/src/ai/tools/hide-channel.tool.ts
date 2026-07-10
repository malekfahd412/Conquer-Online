import { ChannelType } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class HideChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'hide_channel',
    description: 'Hides a channel from @everyone by denying ViewChannel permission.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel to hide' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Hide the announcements channel', 'Hide #staff-chat from everyone'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as GuildChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${params['name']}" not found` };
    if (!('permissionOverwrites' in channel)) return { success: false, message: 'Cannot set permissions on this channel type' };

    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    return { success: true, message: `🙈 Hidden **#${channel.name}** — @everyone cannot see it` };
  }
}
