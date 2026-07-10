import { ChannelType } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RevealChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'reveal_channel',
    description: 'Makes a hidden channel visible to @everyone by removing the ViewChannel deny.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel to reveal' },
      },
      required: ['name'],
    },
    dangerous: false,
    examples: ['Reveal #general to everyone', 'Show the events channel'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === name,
    ) as GuildChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${params['name']}" not found` };
    if (!('permissionOverwrites' in channel)) return { success: false, message: 'Cannot set permissions on this channel type' };

    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null });
    return { success: true, message: `👁️ Revealed **#${channel.name}** — @everyone can now see it` };
  }
}
