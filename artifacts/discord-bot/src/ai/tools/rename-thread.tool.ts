import { ChannelType } from 'discord.js';
import type { Guild, ThreadChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class RenameThreadTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'rename_thread',
    description: 'Renames a thread.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current name of the thread' },
        new_name: { type: 'string', description: 'New name for the thread' },
      },
      required: ['name', 'new_name'],
    },
    dangerous: false,
    examples: ['Rename the event-planning thread to guild-war-planning'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const name = String(params['name'] ?? '').trim().toLowerCase();
    const newName = String(params['new_name'] ?? '').trim();
    if (!newName) return { success: false, message: 'New name is required' };

    const thread = guild.channels.cache.find(
      c =>
        (c.type === ChannelType.PublicThread ||
          c.type === ChannelType.PrivateThread ||
          c.type === ChannelType.AnnouncementThread) &&
        c.name.toLowerCase() === name,
    ) as ThreadChannel | undefined;

    if (!thread) return { success: false, message: `Thread "${params['name']}" not found` };

    await thread.setName(newName);
    return { success: true, message: `Renamed thread **${params['name']}** → **${newName}**` };
  }
}
