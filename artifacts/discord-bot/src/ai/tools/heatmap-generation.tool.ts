import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class HeatmapGenerationTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'heatmap_generation',
    description: 'Generates a text-based activity heatmap showing member join distribution by day of week and hour of day, and channel activity patterns based on cached data.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of heatmap: "joins" (member join times) or "activity" (message patterns). Default: joins',
        },
      },
      required: [],
    },
    dangerous: false,
    examples: ['show me a heatmap of member joins', 'generate activity heatmap'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const type = String(params['type'] ?? 'joins').toLowerCase();

    if (type === 'joins') {
      const members = guild.members.cache.filter(m => !m.user.bot);
      const dayBuckets = new Array(7).fill(0);
      const hourBuckets = new Array(24).fill(0);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (const [, member] of members) {
        const joined = member.joinedAt;
        if (!joined) continue;
        dayBuckets[joined.getDay()]++;
        hourBuckets[joined.getHours()]++;
      }

      const maxDay = Math.max(...dayBuckets, 1);
      const maxHour = Math.max(...hourBuckets, 1);
      const BAR = '█';
      const BAR_WIDTH = 20;

      const dayLines = dayBuckets.map((count, i) => {
        const filled = Math.round((count / maxDay) * BAR_WIDTH);
        const bar = BAR.repeat(filled).padEnd(BAR_WIDTH);
        return `  ${dayNames[i]}: [${bar}] ${count}`;
      });

      const hourLines: string[] = [];
      for (let h = 0; h < 24; h += 4) {
        const label = `${String(h).padStart(2, '0')}:00`;
        const count = hourBuckets.slice(h, h + 4).reduce((a, b) => a + b, 0);
        const filled = Math.round((count / (maxHour * 4)) * BAR_WIDTH);
        const bar = BAR.repeat(filled).padEnd(BAR_WIDTH);
        hourLines.push(`  ${label}: [${bar}] ${count}`);
      }

      const lines = [
        `🗓️ **Member Join Heatmap** — **${guild.name}**`,
        `Total members analysed: ${members.size}`,
        '',
        '**By Day of Week:**',
        ...dayLines,
        '',
        '**By Hour of Day (UTC, grouped by 4h):**',
        ...hourLines,
        '',
        '_Based on cached member data. Reflects all-time join timestamps._',
      ];
      return { success: true, message: lines.join('\n').slice(0, 4000) };
    }

    // activity heatmap — approximate from channel message counts
    const textChannels = guild.channels.cache.filter(c => c.isTextBased() && !c.isDMBased());
    const lines = [
      `📊 **Channel Activity Heatmap** — **${guild.name}**`,
      `Text-based channels: ${textChannels.size}`,
      '',
      '**Discord API Limitation:** Real-time per-message timestamps require fetching message history for every channel, which is heavily rate-limited and not feasible at scale.',
      '',
      '**Available Channels:**',
      ...[...textChannels.values()].slice(0, 30).map(c => `  #${c.name}`),
      '',
      '_To generate a true activity heatmap, integrate a message-count logging system or use Discord Analytics (Community servers)._',
    ];
    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
