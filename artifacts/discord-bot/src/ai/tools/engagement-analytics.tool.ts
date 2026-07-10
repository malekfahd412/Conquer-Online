import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class EngagementAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'engagement_analytics',
    description: 'Engagement analytics: members in voice now, recent message activity across channels, active thread count, and online presence breakdown.',
    parameters: {
      type: 'object',
      properties: {
        sample_channels: { type: 'string', description: 'Number of text channels to sample for message activity (default: 10)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const sampleN = Math.min(20, Math.max(1, parseInt(String(params['sample_channels'] ?? '10')) || 10));
    const members = guild.members.cache;

    // Presence stats
    const online = members.filter(m => m.presence?.status === 'online').size;
    const idle = members.filter(m => m.presence?.status === 'idle').size;
    const dnd = members.filter(m => m.presence?.status === 'dnd').size;
    const offline = members.size - online - idle - dnd;

    // Voice
    let inVoice = 0;
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildVoice) continue;
      if ('members' in ch) inVoice += (ch as { members: { size: number } }).members.size;
    }

    // Active threads
    let threadCount = 0;
    try {
      const threads = await guild.channels.fetchActiveThreads();
      threadCount = threads.threads.size;
    } catch { threadCount = 0; }

    // Sample channel activity
    const textChs = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .map(c => c as TextChannel)
      .slice(0, sampleN);

    const activity: Array<{ name: string; count: number }> = [];
    for (const ch of textChs) {
      try {
        const msgs = await ch.messages.fetch({ limit: 20 });
        activity.push({ name: ch.name, count: msgs.size });
      } catch { activity.push({ name: ch.name, count: 0 }); }
    }
    activity.sort((a, b) => b.count - a.count);

    const lines = [
      `📊 **Engagement Analytics** — **${guild.name}**`,
      '',
      `**🟢 Online Presence:**`,
      `Online: **${online}** | Idle: ${idle} | DND: ${dnd} | Offline: ${offline}`,
      `In voice: **${inVoice}** | Active threads: **${threadCount}**`,
      '',
      `**💬 Recent Message Activity (${activity.length} sampled channels):**`,
      ...activity.slice(0, 10).map(a => `  #${a.name}: ${a.count} recent messages`),
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
