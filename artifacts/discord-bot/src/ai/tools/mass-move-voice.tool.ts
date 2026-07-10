import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MassMoveVoiceTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'mass_move_voice',
    description: 'Moves all members from one voice channel to another voice channel.',
    parameters: {
      type: 'object',
      properties: {
        from_channel: { type: 'string', description: 'Name or ID of the source voice channel' },
        to_channel: { type: 'string', description: 'Name or ID of the destination voice channel' },
      },
      required: ['from_channel', 'to_channel'],
    },
    dangerous: true,
    dangerDescription: 'Moves all members from one voice channel to another simultaneously.',
    examples: ['Move everyone from Lobby to Gaming', 'Mass move voice members from AFK to General'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const fromQuery = String(params['from_channel'] ?? '').toLowerCase().trim();
    const toQuery = String(params['to_channel'] ?? '').toLowerCase().trim();

    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
    const fromCh = voiceChannels.find(c => c.id === fromQuery || c.name.toLowerCase() === fromQuery);
    const toCh = voiceChannels.find(c => c.id === toQuery || c.name.toLowerCase() === toQuery);

    if (!fromCh) return { success: false, message: `Source voice channel "${params['from_channel']}" not found` };
    if (!toCh) return { success: false, message: `Destination voice channel "${params['to_channel']}" not found` };

    const members = await guild.members.fetch();
    const targets = members.filter(m => m.voice.channelId === fromCh.id);

    if (targets.size === 0) return { success: true, message: `No members are in **${fromCh.name}**` };

    let success = 0; let failed = 0;
    for (const m of targets.values()) {
      try { await m.voice.setChannel(toCh.id); success++; } catch { failed++; }
    }

    return { success: true, message: `**Mass Move Voice:** Moved ${success} member(s) from **${fromCh.name}** → **${toCh.name}**, ${failed} failed` };
  }
}
