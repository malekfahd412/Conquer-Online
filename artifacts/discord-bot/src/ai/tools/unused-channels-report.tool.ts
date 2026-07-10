import { ChannelType } from 'discord.js';
import type { Guild, TextChannel } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class UnusedChannelsReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'unused_channels_report',
    description: 'Identifies text channels that appear inactive based on cached message history and creation date. Reports channels with no recent messages.',
    parameters: {
      type: 'object',
      properties: {
        check_recent: { type: 'string', description: 'Set to "true" to fetch recent messages to check activity (slower, more accurate)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const checkRecent = String(params['check_recent'] ?? '').toLowerCase() === 'true';
    const textChannels = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .map(c => c as TextChannel);

    const unused: Array<{ name: string; id: string; reason: string }> = [];
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const ch of textChannels) {
      if (checkRecent) {
        try {
          const msgs = await ch.messages.fetch({ limit: 5 });
          if (msgs.size === 0) {
            unused.push({ name: ch.name, id: ch.id, reason: 'No messages fetched' });
          } else {
            const latest = msgs.first();
            if (latest && (now - latest.createdTimestamp) > thirtyDaysMs) {
              unused.push({ name: ch.name, id: ch.id, reason: `Last message ${Math.round((now - latest.createdTimestamp) / (24 * 60 * 60 * 1000))} days ago` });
            }
          }
        } catch { /* skip inaccessible */ }
      } else {
        // Heuristic: channels with only 1 permission overwrite (default) and 0 members in voice
        if (ch.permissionOverwrites.cache.size <= 1) {
          const ageMs = now - ch.createdTimestamp;
          if (ageMs > thirtyDaysMs) {
            unused.push({ name: ch.name, id: ch.id, reason: 'No custom permissions, >30 days old' });
          }
        }
      }
    }

    if (unused.length === 0) {
      return { success: true, message: `✅ No obviously unused channels found in **${guild.name}** (${checkRecent ? 'checked recent messages' : 'heuristic scan'})` };
    }

    const lines = [
      `📊 **Unused Channels Report** — **${guild.name}**`,
      `Found **${unused.length}** potentially unused channel(s) out of ${textChannels.length} total:\n`,
    ];
    for (const ch of unused.slice(0, 25)) {
      lines.push(`• **#${ch.name}** (\`${ch.id}\`) — ${ch.reason}`);
    }
    if (unused.length > 25) lines.push(`_...and ${unused.length - 25} more_`);
    lines.push(`\n💡 Use \`delete_channel\` to remove unused channels after review.`);

    return { success: true, message: lines.join('\n') };
  }
}
