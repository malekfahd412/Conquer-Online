// ─────────────────────────────────────────────────────────────────────────────
// Staff Progress Designer — sp:* custom ID namespace.
// Entry point: 📊 Staff Progress button in CC Tickets category.
//
// Custom ID schema:
//   sp:home              → overview, all-time
//   sp:v:<period>        → overview for a period (7d / 30d / al)
//   sp:staff:<id>:<p>    → per-staff detail page
//   sp:back:<period>     → back to overview with same period
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
import { statisticsEngine } from '../../../community/tickets/statistics-engine';
import { reviewEngine } from '../../../community/tickets/review-engine';
import { computeAnalytics, type ReviewPeriod } from '../../../community/tickets/review-analytics-engine';
import { logger } from '../../../utils/logger';

// ── Custom-ID guard ───────────────────────────────────────────────────────────

export function isSPInteraction(customId: string): boolean {
  return customId.startsWith('sp:');
}

// ── Period helpers ────────────────────────────────────────────────────────────

type PeriodCode = '7d' | '30d' | 'al';

const PERIOD_LABELS: Record<PeriodCode, string> = {
  '7d':  '📅 7 Days',
  '30d': '📆 30 Days',
  'al':  '🌐 All Time',
};

const PERIOD_LONG: Record<PeriodCode, string> = {
  '7d':  'Last 7 Days',
  '30d': 'Last 30 Days',
  'al':  'All Time',
};

function toReviewPeriod(code: PeriodCode): ReviewPeriod {
  if (code === '7d')  return '7d';
  if (code === '30d') return '30d';
  return 'all';
}

function sinceMs(code: PeriodCode): number {
  const now = Date.now();
  if (code === '7d')  return now - 7  * 24 * 60 * 60 * 1000;
  if (code === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

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

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const RANK_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

function medal(i: number): string {
  return RANK_MEDALS[i] ?? `${i + 1}.`;
}

// ── Designer ──────────────────────────────────────────────────────────────────

class StaffProgressDesigner {

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!interaction.isButton()) return;
    const btn = interaction as ButtonInteraction;
    const id  = btn.customId;

    await btn.deferUpdate();

    try {
      if (id === 'sp:home') {
        await this.renderOverview(btn, guild, 'al');
        return;
      }
      if (id.startsWith('sp:v:')) {
        await this.renderOverview(btn, guild, id.slice('sp:v:'.length) as PeriodCode);
        return;
      }
      if (id.startsWith('sp:back:')) {
        await this.renderOverview(btn, guild, id.slice('sp:back:'.length) as PeriodCode);
        return;
      }
      if (id.startsWith('sp:staff:')) {
        // id = sp:staff:<userId>:<period>
        const rest      = id.slice('sp:staff:'.length);
        const lastColon = rest.lastIndexOf(':');
        const userId    = rest.slice(0, lastColon);
        const period    = rest.slice(lastColon + 1) as PeriodCode;
        await this.renderStaff(btn, guild, userId, period);
        return;
      }
      logger.warning(`[SP] Unrouted custom ID: ${id}`);
    } catch (err) {
      logger.error('[SP] handleInteraction error', err);
    }
  }

  // ── Overview ──────────────────────────────────────────────────────────────

  private async renderOverview(
    interaction: ButtonInteraction,
    guild:       Guild,
    period:      PeriodCode,
  ): Promise<void> {
    const guildId  = guild.id;
    const reviews  = await reviewEngine.getAll(guildId);
    const analytics = computeAnalytics(reviews, toReviewPeriod(period));
    const dashboard = await statisticsEngine.getDashboard(guildId);

    // Claims leaderboard — use weekly stats for 7d/30d, all-time otherwise
    const topStaff: [string, number][] = period !== 'al'
      ? (await statisticsEngine.getWeeklyStats(guildId, sinceMs(period))).topStaff
      : dashboard.leaderboard.slice(0, 10);

    const staffMap = new Map(analytics.staffStats.map(s => [s.userId, s]));

    const leaderLines = topStaff.length
      ? topStaff.map(([userId, claims], i) => {
          const rev    = staffMap.get(userId);
          const rating = rev && rev.avgRating > 0 ? ` · ⭐ ${rev.avgRating.toFixed(1)}` : '';
          const respMs = rev?.avgResponseMs ?? (i === 0 ? dashboard.avgResponseMs : undefined);
          const resp   = respMs ? ` · ⏱ ${fmtMs(respMs)}` : '';
          return `${medal(i)} <@${userId}> — **${claims}** claims${rating}${resp}`;
        }).join('\n')
      : '_No ticket activity in this period._';

    const bestLine = analytics.bestStaff
      ? `<@${analytics.bestStaff.userId}> — ⭐ ${analytics.bestStaff.avgRating.toFixed(2)} (${analytics.bestStaff.totalReviews} review${analytics.bestStaff.totalReviews !== 1 ? 's' : ''})`
      : '_Not enough data yet_';

    const worstLine = analytics.worstStaff
      ? `<@${analytics.worstStaff.userId}> — ⭐ ${analytics.worstStaff.avgRating.toFixed(2)} (${analytics.worstStaff.totalReviews} review${analytics.worstStaff.totalReviews !== 1 ? 's' : ''})`
      : '_Not enough data yet_';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📊 Staff Progress Dashboard')
      .setDescription(`Showing data for **${PERIOD_LONG[period]}**`)
      .addFields(
        {
          name:   '🎫 Ticket Overview (All Time)',
          value:  `**Total:** ${dashboard.total}  ·  **Open:** ${dashboard.open}  ·  **Closed:** ${dashboard.closed}\n**Avg First Response:** ${fmtMs(dashboard.avgResponseMs)}`,
          inline: false,
        },
        {
          name:   `🏆 Top Staff by Claims — ${PERIOD_LONG[period]}`,
          value:  leaderLines,
          inline: false,
        },
        {
          name:   `⭐ Reviews — ${PERIOD_LONG[period]}`,
          value:  analytics.totalReviews > 0
            ? `**${analytics.totalReviews}** review(s) · Avg rating: ${fmtRating(analytics.avgRating)}`
            : '_No reviews in this period._',
          inline: false,
        },
        {
          name:   '🌟 Highest Rated Staff',
          value:  bestLine,
          inline: true,
        },
        {
          name:   '⚠️ Needs Improvement',
          value:  worstLine,
          inline: true,
        },
      )
      .setFooter({ text: "Staff Progress · Use the buttons below to filter by period or view a staff member's full profile" });

    // Period toggle row
    const periodRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...(['7d', '30d', 'al'] as PeriodCode[]).map(p =>
        new ButtonBuilder()
          .setCustomId(`sp:v:${p}`)
          .setLabel(PERIOD_LABELS[p])
          .setStyle(p === period ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(p === period),
      ),
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [periodRow];

    // Drill-down row: up to 5 staff members
    const drillDown = topStaff.slice(0, 5);
    if (drillDown.length > 0) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...drillDown.map(([userId], i) =>
            new ButtonBuilder()
              .setCustomId(`sp:staff:${userId}:${period}`)
              .setLabel(`${RANK_ORDINALS[i] ?? `#${i + 1}`} Staff`)
              .setStyle(ButtonStyle.Secondary),
          ),
        ),
      );
    }

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('cc:cat:tickets').setLabel('🎫 Tickets').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cc:home').setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
      ),
    );

    await interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Per-staff detail ──────────────────────────────────────────────────────

  private async renderStaff(
    interaction: ButtonInteraction,
    guild:       Guild,
    userId:      string,
    period:      PeriodCode,
  ): Promise<void> {
    const guildId  = guild.id;
    const reviews  = await reviewEngine.getAll(guildId);
    const analytics = computeAnalytics(reviews, toReviewPeriod(period));
    const dashboard = await statisticsEngine.getDashboard(guildId);

    const allTimeClaims = dashboard.leaderboard.find(([id]) => id === userId)?.[1] ?? 0;
    const allTimeRank   = dashboard.leaderboard.findIndex(([id]) => id === userId);
    const rankLabel     = allTimeRank >= 0 ? `#${allTimeRank + 1} all-time` : 'unranked';

    let periodClaims: number | null = null;
    if (period !== 'al') {
      const weekly = await statisticsEngine.getWeeklyStats(guildId, sinceMs(period));
      periodClaims = weekly.topStaff.find(([id]) => id === userId)?.[1] ?? 0;
    }

    const claimsValue = period === 'al'
      ? `**${allTimeClaims}** (rank ${rankLabel})`
      : `**${periodClaims ?? 0}** in ${PERIOD_LONG[period]} · **${allTimeClaims}** total (rank ${rankLabel})`;

    const revStat = analytics.staffStats.find(s => s.userId === userId);

    // Try to resolve display name from guild
    let displayName = `<@${userId}>`;
    try {
      const member = await guild.members.fetch(userId);
      displayName  = `**${member.displayName}**`;
    } catch {
      // Member left or fetch failed — fall back to mention
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('👤 Staff Profile')
      .setDescription(`${displayName} (<@${userId}>)\nShowing data for **${PERIOD_LONG[period]}**`)
      .addFields(
        {
          name:   '🎫 Claims',
          value:  claimsValue,
          inline: false,
        },
        {
          name:   '⭐ Reviews Received',
          value:  revStat ? `${revStat.totalReviews}` : '0',
          inline: true,
        },
        {
          name:   '🌟 Avg Rating',
          value:  revStat ? fmtRating(revStat.avgRating) : '—',
          inline: true,
        },
        {
          name:   '⏱ Avg Response Time',
          value:  revStat?.avgResponseMs
            ? fmtMs(revStat.avgResponseMs)
            : (period === 'al' ? fmtMs(dashboard.avgResponseMs) : '—'),
          inline: true,
        },
        {
          name:   '⏳ Avg Resolution Time',
          value:  revStat?.avgResolutionMs ? fmtMs(revStat.avgResolutionMs) : '—',
          inline: true,
        },
      )
      .setFooter({ text: 'Staff Progress · Per-staff profile' });

    const periodRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...(['7d', '30d', 'al'] as PeriodCode[]).map(p =>
        new ButtonBuilder()
          .setCustomId(`sp:staff:${userId}:${p}`)
          .setLabel(PERIOD_LABELS[p])
          .setStyle(p === period ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(p === period),
      ),
    );

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`sp:back:${period}`).setLabel('← Overview').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cc:cat:tickets').setLabel('🎫 Tickets').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cc:home').setLabel('🏠 CC Home').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [periodRow, navRow] });
  }
}

export const staffProgressDesigner = new StaffProgressDesigner();
