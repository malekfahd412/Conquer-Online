import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

const VERIFICATION_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Very High',
};

const FILTER_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Members Without Roles',
  2: 'All Members',
};

export class ViewGuildInfoTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'view_guild_info',
    description: 'Shows detailed server information: member count, channels, roles, features, boost level, verification, and settings.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
    examples: ['Show server info', 'What are the server settings?', 'How many members do we have?'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const members = await guild.members.fetch();
    const bots = members.filter(m => m.user.bot).size;
    const humans = members.size - bots;

    const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;
    const roles = guild.roles.cache.size - 1;

    const info = [
      `**📋 Server: ${guild.name}**`,
      `• ID: ${guild.id}`,
      `• Owner: <@${guild.ownerId}>`,
      `• Created: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
      `• Locale: ${guild.preferredLocale}`,
      '',
      `**👥 Members**`,
      `• Total: ${members.size} (${humans} humans, ${bots} bots)`,
      '',
      `**📁 Channels**`,
      `• Text: ${textChannels} | Voice: ${voiceChannels} | Categories: ${categories}`,
      '',
      `**🎭 Roles:** ${roles}`,
      '',
      `**🔒 Security**`,
      `• Verification: ${VERIFICATION_LABELS[guild.verificationLevel] ?? 'Unknown'}`,
      `• Explicit Filter: ${FILTER_LABELS[guild.explicitContentFilter] ?? 'Unknown'}`,
      '',
      `**🚀 Boost**`,
      `• Level: ${guild.premiumTier} | Boosts: ${guild.premiumSubscriptionCount ?? 0}`,
      '',
      `**✨ Features:** ${guild.features.length > 0 ? guild.features.join(', ') : 'None'}`,
    ].join('\n');

    return { success: true, message: info };
  }
}
