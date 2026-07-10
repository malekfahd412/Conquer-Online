import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ReactionAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'reaction_analytics',
    description: 'Analyzes reaction usage across recent messages in a channel: top emojis used, most reacted messages, and reaction frequency.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to analyze (default: scans first 3 text channels)' },
        limit: { type: 'string', description: 'Messages to scan (default: 50, max: 100)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const limit = Math.min(100, Math.max(1, parseInt(String(params['limit'] ?? '50')) || 50));
    const chQuery = String(params['channel'] ?? '').toLowerCase().trim();

    let channelsToScan: TextChannel[];
    if (chQuery) {
      const ch = guild.channels.cache.find(c =>
        (c.type === ChannelType.GuildText) && (c.id === chQuery || c.name.toLowerCase() === chQuery)
      ) as TextChannel | undefined;
      if (!ch) return { success: false, message: `Channel "${params['channel']}" not found` };
      channelsToScan = [ch];
    } else {
      channelsToScan = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => c as TextChannel).slice(0, 3);
    }

    const emojiCounts: Record<string, number> = {};
    const topReacted: Array<{ content: string; total: number; channel: string }> = [];
    let totalReactions = 0;

    for (const ch of channelsToScan) {
      try {
        const msgs = await ch.messages.fetch({ limit });
        for (const [, msg] of msgs) {
          let msgTotal = 0;
          for (const [, reaction] of msg.reactions.cache) {
            const emojiKey = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : (reaction.emoji.name ?? '?');
            emojiCounts[emojiKey] = (emojiCounts[emojiKey] ?? 0) + reaction.count;
            msgTotal += reaction.count;
            totalReactions += reaction.count;
          }
          if (msgTotal > 0) {
            const preview = msg.content.slice(0, 50) || (msg.embeds.length ? '[embed]' : '[no content]');
            topReacted.push({ content: preview, total: msgTotal, channel: ch.name });
          }
        }
      } catch { /* skip inaccessible */ }
    }

    topReacted.sort((a, b) => b.total - a.total);
    const topEmojis = Object.entries(emojiCounts).sort(([, a], [, b]) => b - a).slice(0, 15);

    const lines = [
      `😀 **Reaction Analytics** — **${guild.name}**`,
      `Scanned ${channelsToScan.length} channel(s) | Total reactions found: **${totalReactions}**`,
      '',
      `**Top Emojis:**`,
    ];

    if (topEmojis.length === 0) {
      lines.push('  _No reactions found in recent messages_');
    } else {
      for (const [emoji, count] of topEmojis) {
        lines.push(`  ${emoji} — **${count}** use(s)`);
      }
    }

    lines.push('', `**Most Reacted Messages:**`);
    for (const msg of topReacted.slice(0, 5)) {
      lines.push(`  **${msg.total}** reactions — #${msg.channel}: "${msg.content}"`);
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
