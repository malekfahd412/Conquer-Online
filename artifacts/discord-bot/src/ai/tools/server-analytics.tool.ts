import { ChannelType } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { fmtNum, progressBar } from './analytics-helpers';

export class ServerAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'server_analytics',
    description: 'Comprehensive server-wide analytics: member breakdown, channel stats, role distribution, boost tier, emoji/sticker usage, and resource utilization.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const members = guild.members.cache;
    const bots = members.filter(m => m.user.bot).size;
    const humans = members.filter(m => !m.user.bot).size;
    const online = members.filter(m => m.presence?.status === 'online').size;
    const idle = members.filter(m => m.presence?.status === 'idle').size;
    const dnd = members.filter(m => m.presence?.status === 'dnd').size;

    const channels = guild.channels.cache;
    const textChs = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChs = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const catChs = channels.filter(c => c.type === ChannelType.GuildCategory).size;
    const forumChs = channels.filter(c => c.type === ChannelType.GuildForum).size;

    const boostTier = guild.premiumTier;
    const emojiLimit = [50, 100, 150, 250][boostTier] ?? 50;
    const stickerLimit = [5, 15, 30, 60][boostTier] ?? 5;

    const lines = [
      `📊 **Server Analytics** — **${guild.name}**`,
      `ID: \`${guild.id}\` | Created: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
      '',
      `**👥 Members**`,
      `Total: **${fmtNum(guild.memberCount)}** | Humans: ${fmtNum(humans)} | Bots: ${fmtNum(bots)}`,
      `Online: ${online} | Idle: ${idle} | DND: ${dnd} | Offline: ${humans - online - idle - dnd}`,
      '',
      `**📺 Channels (${fmtNum(channels.size)}/500)**`,
      `${progressBar(channels.size, 500)} ${Math.round(channels.size / 500 * 100)}%`,
      `Text: ${textChs} | Voice: ${voiceChs} | Categories: ${catChs} | Forum: ${forumChs}`,
      '',
      `**🎭 Roles: ${guild.roles.cache.size}/250**`,
      `${progressBar(guild.roles.cache.size, 250)} ${Math.round(guild.roles.cache.size / 250 * 100)}%`,
      '',
      `**💎 Boost Status**`,
      `Tier ${boostTier} | ${guild.premiumSubscriptionCount ?? 0} boost(s)`,
      '',
      `**😀 Emojis: ${guild.emojis.cache.size}/${emojiLimit}** | **🎨 Stickers: ${guild.stickers.cache.size}/${stickerLimit}**`,
      `Emojis: ${progressBar(guild.emojis.cache.size, emojiLimit)} | Stickers: ${progressBar(guild.stickers.cache.size, stickerLimit)}`,
      '',
      `**✨ Features:** ${guild.features.slice(0, 5).join(', ') || 'None'}`,
    ];

    return { success: true, message: lines.join('\n') };
  }
}
