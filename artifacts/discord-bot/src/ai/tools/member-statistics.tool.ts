import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class MemberStatisticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'member_statistics',
    description: 'Shows aggregate member statistics: total, bots, humans, role distribution, join rate, voice activity.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    dangerous: false,
    examples: ['Show member statistics', 'How many bots vs humans are in the server?', 'Member breakdown'],
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const members = await guild.members.fetch();
    const bots = members.filter(m => m.user.bot);
    const humans = members.filter(m => !m.user.bot);
    const inVoice = members.filter(m => !!m.voice.channelId);
    const timedOut = members.filter(m => !!m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now());
    const withNickname = members.filter(m => !!m.nickname);

    // Join rate: members who joined in the last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentJoins = members.filter(m => (m.joinedTimestamp ?? 0) > thirtyDaysAgo);

    // Top roles by member count
    const roleCounts = new Map<string, number>();
    for (const m of members.values()) {
      for (const r of m.roles.cache.values()) {
        if (r.name !== '@everyone') roleCounts.set(r.name, (roleCounts.get(r.name) ?? 0) + 1);
      }
    }
    const topRoles = [...roleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `  • ${name}: ${count}`)
      .join('\n');

    const lines = [
      `**📊 Server Member Statistics — ${guild.name}**`,
      ``,
      `**👥 Overview**`,
      `• Total Members: **${members.size}**`,
      `• Humans: **${humans.size}** | Bots: **${bots.size}**`,
      `• In Voice: **${inVoice.size}**`,
      `• Timed Out: **${timedOut.size}**`,
      `• With Nickname: **${withNickname.size}**`,
      ``,
      `**📈 Activity**`,
      `• New Joins (30d): **${recentJoins.size}**`,
      `• Daily Join Rate (30d avg): **${(recentJoins.size / 30).toFixed(1)}/day**`,
      ``,
      `**🎭 Top Roles by Membership:**`,
      topRoles || '  • No roles with members',
      ``,
      `**🚀 Boost:** Level ${guild.premiumTier} — ${guild.premiumSubscriptionCount ?? 0} boosts`,
    ];

    return { success: true, message: lines.join('\n') };
  }
}
