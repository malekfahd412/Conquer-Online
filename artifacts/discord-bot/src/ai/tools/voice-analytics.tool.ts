import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class VoiceAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'voice_analytics',
    description: 'Real-time voice channel analytics: currently active channels, member distribution, AFK channel stats, bitrate utilization, and user limit usage.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const voiceChannels = guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
    );

    interface VoiceStat { name: string; members: number; userLimit: number; bitrate: number; type: string }
    const stats: VoiceStat[] = [];
    let totalMembers = 0;

    for (const [, ch] of voiceChannels) {
      if (!('members' in ch)) continue;
      const vc = ch as { members: { size: number }; name: string; bitrate?: number; userLimit?: number; type: number };
      const memberCount = vc.members.size;
      totalMembers += memberCount;
      stats.push({
        name: ch.name,
        members: memberCount,
        userLimit: vc.userLimit ?? 0,
        bitrate: vc.bitrate ?? 64000,
        type: ch.type === ChannelType.GuildStageVoice ? 'Stage' : 'Voice',
      });
    }

    stats.sort((a, b) => b.members - a.members);
    const active = stats.filter(s => s.members > 0);
    const afkCh = guild.afkChannelId ? guild.channels.cache.get(guild.afkChannelId) : null;
    const afkMembers = afkCh && 'members' in afkCh ? (afkCh as { members: { size: number } }).members.size : 0;

    const lines = [
      `🎙️ **Voice Analytics** — **${guild.name}**`,
      `Total voice channels: **${voiceChannels.size}** | Active now: **${active.length}** | In voice: **${totalMembers}** member(s)`,
      '',
      `**Currently Active Channels:**`,
    ];

    if (active.length === 0) {
      lines.push('  _No members in voice channels_');
    } else {
      for (const s of active) {
        const limit = s.userLimit > 0 ? `/${s.userLimit}` : '/∞';
        lines.push(`  🔊 **${s.name}** [${s.type}] — ${s.members}${limit} members | ${Math.round(s.bitrate / 1000)}kbps`);
      }
    }

    lines.push('', `**All Voice Channels (${stats.length}):**`);
    for (const s of stats.slice(0, 15)) {
      const limit = s.userLimit > 0 ? `/${s.userLimit}` : '/∞';
      lines.push(`  ${s.members > 0 ? '🟢' : '⚫'} **${s.name}** — ${s.members}${limit}`);
    }

    if (afkCh) lines.push('', `**AFK Channel:** ${afkCh.name} | Timeout: ${guild.afkTimeout}s | Members: ${afkMembers}`);

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
