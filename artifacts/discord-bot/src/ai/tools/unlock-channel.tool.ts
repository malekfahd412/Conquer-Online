import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnlockChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unlock_channel',
    description: 'Unlocks a channel so @everyone can send messages again.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel to unlock' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as TextChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${params['name']}" not found` };
    if (!('permissionOverwrites' in channel)) return { success: false, message: 'Cannot modify this channel type' };

    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    return { success: true, message: `🔓 Unlocked **#${channel.name}** — @everyone can send messages` };
  }
}
