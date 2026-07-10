import { ChannelType, GuildVerificationLevel, GuildExplicitContentFilter } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class ConfigurationReportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'configuration_report',
    description: 'Exports a complete report of the server configuration: settings, channel structure counts, role counts, features, and integrations overview.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const verNames = { [GuildVerificationLevel.None]: 'None', [GuildVerificationLevel.Low]: 'Low', [GuildVerificationLevel.Medium]: 'Medium', [GuildVerificationLevel.High]: 'High', [GuildVerificationLevel.VeryHigh]: 'Very High' };
    const filterNames = { [GuildExplicitContentFilter.Disabled]: 'Disabled', [GuildExplicitContentFilter.MembersWithoutRoles]: 'Members without roles', [GuildExplicitContentFilter.AllMembers]: 'All members' };

    const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
    const textChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const forumChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildForum).size;
    const announceChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildAnnouncement).size;
    const stageChs = guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice).size;

    const rolesTotal = guild.roles.cache.size;
    const adminRoles = guild.roles.cache.filter(r => r.permissions.has('Administrator') && !r.managed).size;
    const botRoles = guild.roles.cache.filter(r => r.managed).size;
    const hoistedRoles = guild.roles.cache.filter(r => r.hoist).size;

    const boostTier = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount ?? 0;
    const emojiCount = guild.emojis.cache.size;
    const stickerCount = guild.stickers.cache.size;

    const lines = [
      `⚙️ **Configuration Report** — **${guild.name}**`,
      `ID: \`${guild.id}\` | Owner: <@${guild.ownerId}> | Created: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
      '',
      `**📊 Membership**`,
      `Members: **${guild.memberCount}** | Max: ${guild.maximumMembers ?? 'N/A'} | Bots: est. ${guild.members.cache.filter(m => m.user.bot).size}`,
      '',
      `**📺 Channels (${guild.channels.cache.size} total)**`,
      `Categories: ${cats} | Text: ${textChs} | Voice: ${voiceChs} | Forum: ${forumChs}`,
      `Announcements: ${announceChs} | Stage: ${stageChs}`,
      '',
      `**🎭 Roles (${rolesTotal} total)**`,
      `Admin roles: ${adminRoles} | Managed/bot: ${botRoles} | Hoisted: ${hoistedRoles}`,
      '',
      `**🔒 Security**`,
      `Verification: **${verNames[guild.verificationLevel] ?? guild.verificationLevel}** | Content filter: ${filterNames[guild.explicitContentFilter] ?? guild.explicitContentFilter} | 2FA mod: ${guild.mfaLevel ? 'Required' : 'Not required'}`,
      '',
      `**💎 Boost Status**`,
      `Tier: ${boostTier} | Boosts: ${boostCount} | Emojis: ${emojiCount} | Stickers: ${stickerCount}`,
      '',
      `**✨ Features (${guild.features.length})**`,
      guild.features.length ? guild.features.map(f => `\`${f}\``).join(', ') : '_None_',
      '',
      `**⚙️ Settings**`,
      `System channel: ${guild.systemChannelId ? `<#${guild.systemChannelId}>` : '_None_'}`,
      `AFK channel: ${guild.afkChannelId ? `<#${guild.afkChannelId}>` : '_None_'} (timeout: ${guild.afkTimeout}s)`,
      `Locale: \`${guild.preferredLocale}\``,
      `Default notifications: ${guild.defaultMessageNotifications === 0 ? 'All messages' : 'Mentions only'}`,
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
