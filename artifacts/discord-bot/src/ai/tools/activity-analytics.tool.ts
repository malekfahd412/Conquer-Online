import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ActivityAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'activity_analytics',
    description: 'General server activity analytics: current voice usage, active threads, online presence, and a cross-channel message sample.',
    parameters: {
      type: 'object',
      properties: {
        deep_scan: { type: 'string', description: 'Set to "true" to scan all accessible text channels for recent messages (slower)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const deepScan = String(params['deep_scan'] ?? '').toLowerCase() === 'true';
    const members = guild.members.cache;
    const online = members.filter(m => m.presence?.status !== undefined && m.presence.status !== 'offline').size;
    let inVoice = 0;
    for (const [, ch] of guild.channels.cache) {
      if (ch.type === ChannelType.GuildVoice && 'members' in ch) inVoice += (ch as { members: { size: number } }).members.size;
    }

    let activeThreads = 0;
    try { activeThreads = (await guild.channels.fetchActiveThreads()).threads.size; } catch { }

    const lines = [
      `⚡ **Activity Analytics** — **${guild.name}**`,
      `Online/active members: **${online}/${guild.memberCount}** (${Math.round(online / guild.memberCount * 100)}%)`,
      `In voice: **${inVoice}** | Active threads: **${activeThreads}**`,
      '',
    ];

    if (deepScan) {
      const textChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => c as TextChannel);
      const channelActivity: Array<{ name: string; count: number; lastMs?: number }> = [];
      for (const ch of textChs.slice(0, 15)) {
        try {
          const msgs = await ch.messages.fetch({ limit: 10 });
          const last = msgs.first();
          channelActivity.push({ name: ch.name, count: msgs.size, lastMs: last?.createdTimestamp });
        } catch { channelActivity.push({ name: ch.name, count: 0 }); }
      }
      channelActivity.sort((a, b) => (b.lastMs ?? 0) - (a.lastMs ?? 0));

      lines.push(`**Most Recently Active Channels:**`);
      for (const ch of channelActivity.slice(0, 10)) {
        const last = ch.lastMs ? `<t:${Math.floor(ch.lastMs / 1000)}:R>` : 'Unknown';
        lines.push(`  #${ch.name} — last message ${last} | ${ch.count} fetched`);
      }
    } else {
      lines.push('_Set deep_scan=true to get cross-channel message activity_');
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
