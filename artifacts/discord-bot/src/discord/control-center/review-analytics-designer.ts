// ─────────────────────────────────────────────────────────────────────────────
// Review Analytics Designer — Control Center page for Review Analytics Pro.
// Handles all ra:* custom-ID interactions. Accessible from the CC tickets
// category via the "⭐ Review Analytics" button.
//
// Custom ID schema:
//   ra:home              → entry point (overview, all-time)
//   ra:v:<view>:<period> → navigate to a view with a period
//     view:   ov (overview) | st (staff) | ty (types) | bd (leaderboard)
//     period: td (today)   | 7d          | 30d         | al (all time)
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type Interaction,
  type ButtonInteraction,
} from 'discord.js';
import { reviewEngine } from '../../community/tickets/review-engine';
import { computeAnalytics, type ReviewPeriod, type ReviewAnalytics } from '../../community/tickets/review-analytics-engine';
import { logger } from '../../utils/logger';

// ── Custom-ID helpers ────────────────────────────────────────────────────────

export function isRAInteraction(customId: string): boolean {
  return customId.startsWith('ra:');
}

const RA = {
  HOME:       'ra:home',
  view:       (v: ViewCode, p: PeriodCode): string => `ra:v:${v}:${p}`,
  CC_HOME:    'cc:home',
  CC_TICKETS: 'cc:cat:tickets',
} as const;

type ViewCode   = 'ov' | 'st' | 'ty' | 'bd';
type PeriodCode = 'td' | '7d' | '30d' | 'al';

const VIEW_LABELS: Record<ViewCode, string>   = { ov: '📊 Overview', st: '👥 Staff', ty: '🏷️ Types', bd: '🏆 Leaderboard' };
const PERIOD_LABELS: Record<PeriodCode, string> = { td: '🗓 Today', '7d': '📅 7 Days', '30d': '📆 30 Days', al: '🌐 All Time' };
const PERIOD_LONG: Record<PeriodCode, string>   = { td: 'Today', '7d': 'Last 7 Days', '30d': 'Last 30 Days', al: 'All Time' };

function toEnginePeriod(code: PeriodCode): ReviewPeriod {
  switch (code) {
    case 'td':  return 'today';
    case '7d':  return '7d';
    case '30d': return '30d';
    default:    return 'all';
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtMs(ms: number | undefined): string {
  if (!ms || ms <= 0) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem   = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function fmtRating(avg: number): string {
  return avg > 0 ? `⭐ ${avg.toFixed(2)}` : '—';
}

function ratingBar(count: number, total: number, width = 8): string {
  const filled = total > 0 ? Math.round((count / total) * width) : 0;
  const f      = Math.min(filled, width);
  return '█'.repeat(f) + '░'.repeat(width - f);
}

function pct(count: number, total: number): string {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : '0%';
}

function ratingColor(avg: number): number {
  if (avg >= 4.5) return 0x57f287;
  if (avg >= 3.5) return 0xfee75c;
  if (avg >= 2.5) return 0xf5a623;
  return 0xed4245;
}

function noDataEmbed(title: string, period: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x99aab5)
    .setTitle(title)
    .setDescription(`No reviews found for **${period}**.\n\nEnable the Review System on a Ticket Panel and reviews will appear here once users start rating their experience.`)
    .setFooter({ text: 'Review Analytics Pro' });
}

// ── Component builders ───────────────────────────────────────────────────────

function buildFilterRow(view: ViewCode, active: PeriodCode): ActionRowBuilder<ButtonBuilder> {
  const periods: PeriodCode[] = ['td', '7d', '30d', 'al'];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    periods.map(p =>
      new ButtonBuilder()
        .setCustomId(RA.view(view, p))
        .setLabel(PERIOD_LABELS[p])
        .setStyle(p === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
}

function buildViewRow(active: ViewCode, period: PeriodCode): ActionRowBuilder<ButtonBuilder> {
  const views: ViewCode[] = ['ov', 'st', 'ty', 'bd'];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    views.map(v =>
      new ButtonBuilder()
        .setCustomId(RA.view(v, period))
        .setLabel(VIEW_LABELS[v])
        .setStyle(v === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
}

function buildNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(RA.CC_TICKETS).setLabel('🎫 Tickets').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(RA.CC_HOME).setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
  );
}

// ── Embed builders ───────────────────────────────────────────────────────────

function buildOverviewEmbed(a: ReviewAnalytics, period: PeriodCode): EmbedBuilder {
  const pLabel = PERIOD_LONG[period];

  if (a.totalReviews === 0) return noDataEmbed(`📊 Review Analytics — ${pLabel}`, pLabel);

  const total = a.totalReviews;
  const stars  = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'] as const;

  const distLines = [4, 3, 2, 1, 0].map(i => {
    const c = a.distribution[i];
    return `${stars[i].padEnd(10)} \`${ratingBar(c, total)}\` ${pct(c, total).padStart(4)}  (${c})`;
  }).join('\n');

  const t = a.trend;
  const trendLines = [
    `**Today:** ${t.today.count ? fmtRating(t.today.avg) + ` (${t.today.count})` : '—'}`,
    `**This Week:** ${t.week.count ? fmtRating(t.week.avg) + ` (${t.week.count})` : '—'}`,
    `**This Month:** ${t.month.count ? fmtRating(t.month.avg) + ` (${t.month.count})` : '—'}`,
    `**All Time:** ${t.allTime.count ? fmtRating(t.allTime.avg) + ` (${t.allTime.count})` : '—'}`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(ratingColor(a.avgRating))
    .setTitle(`📊 Review Analytics — ${pLabel}`)
    .setDescription(`**${total}** review${total !== 1 ? 's' : ''} · Overall Rating: **${fmtRating(a.avgRating)}**`)
    .addFields(
      { name: '📊 Rating Distribution', value: distLines,  inline: false },
      { name: '📈 Rating Trend',        value: trendLines, inline: false },
    )
    .setFooter({ text: 'Review Analytics Pro · Trend always shows all-time data' })
    .setTimestamp();

  if (a.bestStaff) {
    embed.addFields(
      { name: '🏆 Top Rated Staff',   value: `<@${a.bestStaff.userId}>  ${fmtRating(a.bestStaff.avgRating)} (${a.bestStaff.totalReviews} reviews)`,   inline: true },
    );
  }
  if (a.worstStaff) {
    embed.addFields(
      { name: '📉 Lowest Rated Staff', value: `<@${a.worstStaff.userId}>  ${fmtRating(a.worstStaff.avgRating)} (${a.worstStaff.totalReviews} reviews)`, inline: true },
    );
  }

  return embed;
}

function buildStaffEmbed(a: ReviewAnalytics, period: PeriodCode): EmbedBuilder {
  const pLabel = PERIOD_LONG[period];
  if (a.totalReviews === 0 || a.staffStats.length === 0) {
    return noDataEmbed(`👥 Staff Analytics — ${pLabel}`, pLabel);
  }

  const rows = a.staffStats.slice(0, 10).map((s, i) => {
    const respLine = s.avgResponseMs   ? ` · resp ${fmtMs(s.avgResponseMs)}`   : '';
    const resLine  = s.avgResolutionMs ? ` · res ${fmtMs(s.avgResolutionMs)}`  : '';
    return `**${i + 1}.** <@${s.userId}> — ${fmtRating(s.avgRating)} · ${s.totalReviews} reviews${respLine}${resLine}`;
  });

  if (a.staffStats.length > 10) rows.push(`_… and ${a.staffStats.length - 10} more_`);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👥 Staff Analytics — ${pLabel}`)
    .setDescription(`**${a.staffStats.length}** staff member${a.staffStats.length !== 1 ? 's' : ''} with reviews this period`)
    .addFields({ name: '👥 Staff Performance', value: rows.join('\n').slice(0, 1020), inline: false })
    .setFooter({ text: 'Sorted by review volume  ·  Review Analytics Pro' })
    .setTimestamp();

  if (a.bestStaff) {
    embed.addFields({ name: '🏆 Best Rated',   value: `<@${a.bestStaff.userId}>\n${fmtRating(a.bestStaff.avgRating)} · ${a.bestStaff.totalReviews} reviews`,   inline: true });
  }
  if (a.worstStaff && a.worstStaff.userId !== a.bestStaff?.userId) {
    embed.addFields({ name: '📉 Lowest Rated', value: `<@${a.worstStaff.userId}>\n${fmtRating(a.worstStaff.avgRating)} · ${a.worstStaff.totalReviews} reviews`, inline: true });
  }

  const topByVol = a.mostReviewed[0];
  if (topByVol) {
    embed.addFields({ name: '📊 Highest Volume', value: `<@${topByVol.userId}>\n${topByVol.totalReviews} reviews handled`, inline: true });
  }

  return embed;
}

function buildTypesEmbed(a: ReviewAnalytics, period: PeriodCode): EmbedBuilder {
  const pLabel = PERIOD_LONG[period];
  if (a.totalReviews === 0 || a.typeStats.length === 0) {
    return noDataEmbed(`🏷️ Ticket Type Analytics — ${pLabel}`, pLabel);
  }

  const rows = a.typeStats.slice(0, 10).map((t, i) => {
    const resp = t.avgResponseMs   ? ` · resp ${fmtMs(t.avgResponseMs)}`   : '';
    const res  = t.avgResolutionMs ? ` · res ${fmtMs(t.avgResolutionMs)}`  : '';
    return `**${i + 1}.** **${t.ticketType}** — ${fmtRating(t.avgRating)} · ${t.totalReviews} reviews${resp}${res}`;
  });
  if (a.typeStats.length > 10) rows.push(`_… and ${a.typeStats.length - 10} more_`);

  // Response-time ranking (by avgResponseMs asc = fastest)
  const byResp = [...a.typeStats].filter(t => t.avgResponseMs !== undefined).sort((a, b) => (a.avgResponseMs ?? 0) - (b.avgResponseMs ?? 0));
  const byRes  = [...a.typeStats].filter(t => t.avgResolutionMs !== undefined).sort((a, b) => (a.avgResolutionMs ?? 0) - (b.avgResolutionMs ?? 0));

  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle(`🏷️ Ticket Type Analytics — ${pLabel}`)
    .setDescription(`**${a.typeStats.length}** ticket type${a.typeStats.length !== 1 ? 's' : ''} with reviews this period`)
    .addFields({ name: '🏷️ Rating by Type', value: rows.join('\n').slice(0, 1020), inline: false })
    .setFooter({ text: 'Sorted by average rating  ·  Review Analytics Pro' })
    .setTimestamp();

  if (byResp.length >= 2) {
    embed.addFields(
      { name: '⚡ Fastest Response', value: `**${byResp[0].ticketType}**\n${fmtMs(byResp[0].avgResponseMs)} avg`,  inline: true },
      { name: '🐢 Slowest Response', value: `**${byResp[byResp.length-1].ticketType}**\n${fmtMs(byResp[byResp.length-1].avgResponseMs)} avg`, inline: true },
    );
  }
  if (byRes.length >= 2) {
    embed.addFields(
      { name: '⚡ Fastest Resolution', value: `**${byRes[0].ticketType}**\n${fmtMs(byRes[0].avgResolutionMs)} avg`,  inline: true },
      { name: '🐢 Slowest Resolution', value: `**${byRes[byRes.length-1].ticketType}**\n${fmtMs(byRes[byRes.length-1].avgResolutionMs)} avg`, inline: true },
    );
  }

  return embed;
}

function buildLeaderboardEmbed(a: ReviewAnalytics, period: PeriodCode): EmbedBuilder {
  const pLabel = PERIOD_LONG[period];
  if (a.totalReviews === 0) return noDataEmbed(`🏆 Leaderboard — ${pLabel}`, pLabel);

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  const topRatedLines = a.topRated.length > 0
    ? a.topRated.map((s, i) => `${medals[i] ?? `${i + 1}.`} <@${s.userId}> — ${fmtRating(s.avgRating)} · ${s.totalReviews} reviews`)
    : ['_No staff with ≥ 2 reviews yet_'];

  const mostReviewedLines = a.mostReviewed.length > 0
    ? a.mostReviewed.map((s, i) => `${medals[i] ?? `${i + 1}.`} <@${s.userId}> — ${s.totalReviews} reviews · ${fmtRating(s.avgRating)}`)
    : ['_No reviews yet_'];

  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🏆 Leaderboard — ${pLabel}`)
    .setDescription(`Top performers from **${a.totalReviews}** review${a.totalReviews !== 1 ? 's' : ''} this period`)
    .addFields(
      { name: '🏆 Top Rated Staff  _(min 2 reviews)_',  value: topRatedLines.join('\n'),     inline: false },
      { name: '📊 Most Reviewed Staff',                  value: mostReviewedLines.join('\n'), inline: false },
    )
    .setFooter({ text: 'Review Analytics Pro' })
    .setTimestamp();
}

// ── Designer class ────────────────────────────────────────────────────────────

export class ReviewAnalyticsDesigner {
  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!interaction.isButton()) return;
    try {
      await this.routeButton(interaction, guild);
    } catch (err) {
      logger.error('[RA] Interaction error', err);
      if (interaction.isRepliable()) {
        const msg = '❌ An error occurred in Review Analytics.';
        if ((interaction as ButtonInteraction).deferred || (interaction as ButtonInteraction).replied) {
          await (interaction as ButtonInteraction).editReply({ content: msg }).catch(() => {});
        } else {
          await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
        }
      }
    }
  }

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    // ra:home → overview, all time
    if (id === RA.HOME) {
      await this.navView(interaction, guild, 'ov', 'al');
      return;
    }

    // ra:v:<view>:<period>
    if (id.startsWith('ra:v:')) {
      const parts = id.split(':'); // ['ra', 'v', view, period]
      const view   = (parts[2] ?? 'ov') as ViewCode;
      const period = (parts[3] ?? 'al') as PeriodCode;
      await this.navView(interaction, guild, view, period);
      return;
    }

    logger.warning(`[RA] Unrouted button: ${id}`);
  }

  private async navView(interaction: ButtonInteraction, guild: Guild, view: ViewCode, period: PeriodCode): Promise<void> {
    await interaction.deferUpdate();

    const allReviews = await reviewEngine.getAll(guild.id);
    const analytics  = computeAnalytics(allReviews, toEnginePeriod(period));

    let embed: EmbedBuilder;
    switch (view) {
      case 'ov': embed = buildOverviewEmbed(analytics, period);    break;
      case 'st': embed = buildStaffEmbed(analytics, period);       break;
      case 'ty': embed = buildTypesEmbed(analytics, period);       break;
      case 'bd': embed = buildLeaderboardEmbed(analytics, period); break;
      default:   embed = buildOverviewEmbed(analytics, period);
    }

    const components = [
      buildFilterRow(view, period),
      buildViewRow(view, period),
      buildNavRow(),
    ];

    await interaction.editReply({ content: '', embeds: [embed], components });
  }
}

export const reviewAnalyticsDesigner = new ReviewAnalyticsDesigner();
