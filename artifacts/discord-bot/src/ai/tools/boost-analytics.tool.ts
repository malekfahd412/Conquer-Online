import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class BoostAnalyticsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'boost_analytics',
    description: 'Server boost analytics: current tier, boosts needed for next tier, top boosters, boost perks unlocked, and boost progress.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const boosts = guild.premiumSubscriptionCount ?? 0;
    const tier = guild.premiumTier;
    const tierThresholds = [0, 2, 7, 14];
    const tierNames = ['No Tier', 'Tier 1', 'Tier 2', 'Tier 3'];
    const nextTier = tier < 3 ? tierThresholds[tier + 1] : null;
    const boostsNeeded = nextTier ? Math.max(0, nextTier - boosts) : 0;

    const boosters = guild.members.cache
      .filter(m => m.premiumSince !== null)
      .sort((a, b) => (a.premiumSince?.getTime() ?? 0) - (b.premiumSince?.getTime() ?? 0));

    const perks: Record<number, string[]> = {
      0: ['50 custom emojis', '5 custom stickers', '96kbps audio', '8MB upload'],
      1: ['100 custom emojis', '15 custom stickers', '128kbps audio', '8MB upload', 'Custom server invite background'],
      2: ['150 custom emojis', '30 custom stickers', '256kbps audio', '50MB upload', 'Server banner', 'Vanity URL eligible'],
      3: ['250 custom emojis', '60 custom stickers', '384kbps audio', '100MB upload', 'Animated server icon', 'Animated banner'],
    };

    const lines = [
      `💎 **Boost Analytics** — **${guild.name}**`,
      `Current Tier: **${tierNames[tier]}** | Total Boosts: **${boosts}**`,
      nextTier ? `Next tier: ${tierNames[tier + 1]} needs ${nextTier} boosts — **${boostsNeeded} more needed**` : '🏆 **Maximum tier reached!**',
      '',
      `**Current Perks (${tierNames[tier]}):**`,
      ...(perks[tier]?.map(p => `  ✅ ${p}`) ?? []),
    ];

    if (nextTier && tier < 3) {
      lines.push('', `**Next Tier Unlocks (${tierNames[tier + 1]}):**`);
      lines.push(...(perks[tier + 1]?.slice(perks[tier]?.length ?? 0).map(p => `  🔒 ${p}`) ?? []));
    }

    lines.push('', `**Top Boosters (${boosters.size}):**`);
    if (boosters.size === 0) {
      lines.push('  _No current boosters_');
    } else {
      for (const [, m] of boosters) {
        const since = m.premiumSince ? `<t:${Math.floor(m.premiumSince.getTime() / 1000)}:R>` : 'Unknown';
        lines.push(`  💎 **${m.displayName}** — boosting since ${since}`);
      }
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
