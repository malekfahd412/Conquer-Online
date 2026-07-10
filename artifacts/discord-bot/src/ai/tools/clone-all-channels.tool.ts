import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneAllChannelsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_all_channels',
    description: 'Clones all text and voice channels in the server with a suffix. Preserves category placement where possible.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix to append to cloned channel names (default: "-clone")' },
        type_filter: { type: 'string', description: 'Channel type to clone: text, voice, all (default: all)', enum: ['text', 'voice', 'all'] },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      return { success: false, message: 'This will clone all channels. Set `confirm: "CONFIRM"` to proceed.' };
    }
    const suffix = String(params['suffix'] ?? '-clone');
    const typeFilter = String(params['type_filter'] ?? 'all').toLowerCase();
    const created: string[] = [];
    const failed: string[] = [];

    const channels = guild.channels.cache.filter(c => {
      if (typeFilter === 'text') return c.type === ChannelType.GuildText;
      if (typeFilter === 'voice') return c.type === ChannelType.GuildVoice;
      return c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice;
    }).sort((a, b) => a.rawPosition - b.rawPosition);

    for (const [, ch] of channels) {
      const newName = `${ch.name}${suffix}`.slice(0, 100);
      const parentId = 'parentId' in ch ? (ch as { parentId?: string | null }).parentId ?? undefined : undefined;
      try {
        await guild.channels.create({ name: newName, type: ch.type as ChannelType, parent: parentId, reason: 'Clone all channels' });
        created.push(newName);
      } catch { failed.push(ch.name); }
    }

    return {
      success: true,
      message: `✅ Cloned **${created.length}** channel(s)${failed.length ? `, ${failed.length} failed` : ''}.\n${created.slice(0, 10).map(n => `\`${n}\``).join(', ')}${created.length > 10 ? `...and ${created.length - 10} more` : ''}`,
    };
  }
}
