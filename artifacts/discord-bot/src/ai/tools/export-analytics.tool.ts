import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { promises as fs } from 'fs';
import path from 'path';
import { groupByJoinMonth } from './analytics-helpers';

export class ExportAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_analytics',
    description: 'Exports a complete analytics snapshot of the server to a JSON file stored in the bot\'s data directory. Returns the file path and a summary.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label for the export file (default: current timestamp)' },
      },
      required: [],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const label = String(params['label'] ?? `analytics_${Date.now()}`).replace(/\W+/g, '_');
    const filePath = path.join(process.cwd(), 'data', `${label}.json`);

    const members = guild.members.cache;
    const humans = members.filter(m => !m.user.bot);
    const bots = members.filter(m => m.user.bot);
    const joinsByMonth = groupByJoinMonth([...humans.values()]);

    const roleBreakdown = [...guild.roles.cache.values()]
      .filter(r => r.id !== guild.id)
      .map(r => ({
        name: r.name,
        memberCount: members.filter(m => m.roles.cache.has(r.id)).size,
        color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
        position: r.position,
      }))
      .sort((a, b) => b.memberCount - a.memberCount);

    const channelBreakdown = [...guild.channels.cache.values()].map(ch => ({
      name: ch.name,
      type: ChannelType[ch.type] ?? ch.type,
      id: ch.id,
    }));

    const snapshot = {
      exportedAt: new Date().toISOString(),
      guild: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        humanCount: humans.size,
        botCount: bots.size,
        premiumTier: guild.premiumTier,
        premiumSubscriptionCount: guild.premiumSubscriptionCount,
        channelCount: guild.channels.cache.size,
        roleCount: guild.roles.cache.size,
        emojiCount: guild.emojis.cache.size,
        stickerCount: guild.stickers.cache.size,
      },
      memberJoinsByMonth: joinsByMonth,
      roles: roleBreakdown,
      channels: channelBreakdown,
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ Analytics exported to \`data/${label}.json\`\n**Summary:** ${guild.memberCount} members | ${guild.channels.cache.size} channels | ${guild.roles.cache.size} roles | ${Object.keys(joinsByMonth).length} months of join data`,
      data: { filePath, label },
    };
  }
}
