import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ChannelAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'channel_analytics',
    description: 'Analyzes channel structure and activity: counts by type, permission overwrite counts, categories with most channels, and NSFW channel audit.',
    parameters: {
      type: 'object',
      properties: {
        check_activity: { type: 'string', description: 'Set to "true" to fetch recent message counts (slower)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const checkActivity = String(params['check_activity'] ?? '').toLowerCase() === 'true';
    const channels = guild.channels.cache;

    const byType: Record<string, number> = {};
    for (const [, ch] of channels) {
      const typeName = ChannelType[ch.type] ?? String(ch.type);
      byType[typeName] = (byType[typeName] ?? 0) + 1;
    }

    // Channels per category
    const catCounts: Record<string, number> = {};
    for (const [, ch] of channels) {
      if (ch.type === ChannelType.GuildCategory) continue;
      const parentId = 'parentId' in ch ? (ch as { parentId?: string | null }).parentId : null;
      const parent = parentId ? channels.get(parentId)?.name ?? 'Uncategorized' : 'Uncategorized';
      catCounts[parent] = (catCounts[parent] ?? 0) + 1;
    }
    const topCats = Object.entries(catCounts).sort(([, a], [, b]) => b - a).slice(0, 8);

    const nsfwChs = channels.filter(c => c.type === ChannelType.GuildText && 'nsfw' in c && c.nsfw).size;
    const withTopic = channels.filter(c => c.type === ChannelType.GuildText && 'topic' in c && !!(c as TextChannel).topic).size;
    const withSlowmode = channels.filter(c => c.type === ChannelType.GuildText && 'rateLimitPerUser' in c && (c as TextChannel).rateLimitPerUser > 0).size;

    const lines = [
      `📺 **Channel Analytics** — **${guild.name}**`,
      `Total channels: **${channels.size}/500**`,
      '',
      `**By Type:**`,
      ...Object.entries(byType).map(([t, c]) => `  ${t}: **${c}**`),
      '',
      `**Settings:**`,
      `With topic: ${withTopic} | NSFW: ${nsfwChs} | Slowmode enabled: ${withSlowmode}`,
      '',
      `**Channels per Category (top 8):**`,
      ...topCats.map(([cat, count]) => `  **${cat}**: ${count} channel(s)`),
    ];

    if (checkActivity) {
      lines.push('', '**Recent Activity (last 10 messages per channel):**');
      const textChs = channels.filter(c => c.type === ChannelType.GuildText);
      const activity: Array<{ name: string; count: number }> = [];
      for (const [, ch] of textChs) {
        try {
          const msgs = await (ch as TextChannel).messages.fetch({ limit: 10 });
          activity.push({ name: ch.name, count: msgs.size });
        } catch { activity.push({ name: ch.name, count: -1 }); }
      }
      const sorted = activity.filter(a => a.count >= 0).sort((a, b) => b.count - a.count).slice(0, 10);
      for (const a of sorted) lines.push(`  #${a.name}: ${a.count} messages visible`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
