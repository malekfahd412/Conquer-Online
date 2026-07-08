import { ChannelType } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const THREAD_TYPES = new Set([
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

export class CloneChannelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_channel',
    description: 'Clones an existing channel, optionally with a different name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel to clone' },
        new_name: { type: 'string', description: 'Name for the cloned channel (optional)' },
      },
      required: ['name'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const channel = guild.channels.cache.find(
      c =>
        !THREAD_TYPES.has(c.type as never) &&
        c.type !== ChannelType.GuildCategory &&
        c.name.toLowerCase() === name,
    ) as GuildChannel | undefined;

    if (!channel) return { success: false, message: `Channel "${params['name']}" not found or is not cloneable` };

    const cloned = await channel.clone({
      name: params['new_name'] ? String(params['new_name']).trim() : undefined,
    });

    return { success: true, message: `Cloned **#${channel.name}** → **#${cloned.name}**` };
  }
}
