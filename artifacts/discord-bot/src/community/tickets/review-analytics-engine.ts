// ─────────────────────────────────────────────────────────────────────────────
// ReviewAnalyticsEngine — pure computation layer for Review Analytics Pro.
//
// No I/O: call computeAnalytics(allReviews, period) with the raw records read
// from review-engine.ts. All filtering, aggregation, and leaderboard logic lives
// here so the designer file stays focused on Discord rendering.
// ─────────────────────────────────────────────────────────────────────────────
import type { TicketReviewRecord } from './types';

export type ReviewPeriod = 'today' | '7d' | '30d' | 'all';

export interface StaffStat {
  userId: string;
  totalReviews: number;
  avgRating: number;
  avgResponseMs?: number;
  avgResolutionMs?: number;
}

export interface TypeStat {
  ticketType: string;
  totalReviews: number;
  avgRating: number;
  avgResponseMs?: number;
  avgResolutionMs?: number;
}

export interface TrendSlice {
  count: number;
  avg: number;
}

export interface ReviewAnalytics {
  period: ReviewPeriod;
  /** Counts for only the selected period. */
  totalReviews: number;
  /** Average rating for the selected period. 0 when no reviews. */
  avgRating: number;
  /** Distribution of ratings [index 0 = 1★ … index 4 = 5★], period-filtered. */
  distribution: [number, number, number, number, number];
  /**
   * Trend always computed from the FULL guild dataset (unaffected by period filter)
   * so the trend panel is always a stable reference point.
   */
  trend: {
    today:   TrendSlice;
    week:    TrendSlice;
    month:   TrendSlice;
    allTime: TrendSlice;
  };
  /** Per-staff stats for the selected period, sorted by totalReviews desc. */
  staffStats: StaffStat[];
  /** Per-ticket-type stats for the selected period, sorted by avgRating desc. */
  typeStats: TypeStat[];
  /** Top 5 by avgRating — only staff with ≥ 2 reviews qualify. */
  topRated: StaffStat[];
  /** Top 5 by review count — all staff included. */
  mostReviewed: StaffStat[];
  /** Highest avgRating among qualified staff (≥ 2 reviews). */
  bestStaff?: StaffStat;
  /** Lowest avgRating among qualified staff (≥ 2 reviews). */
  worstStaff?: StaffStat;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function periodCutoff(period: ReviewPeriod): number {
  const now = Date.now();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '7d':  return now - 7 * 24 * 60 * 60 * 1000;
    case '30d': return now - 30 * 24 * 60 * 60 * 1000;
    case 'all': return 0;
  }
}

function avgOf(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmtAvg(nums: number[]): number {
  return parseFloat(avgOf(nums).toFixed(2));
}

function trendSlice(reviews: TicketReviewRecord[], since: number): TrendSlice {
  const slice = reviews.filter(r => r.reviewedAt >= since);
  return { count: slice.length, avg: fmtAvg(slice.map(r => r.rating)) };
}

// ── Main export ─────────────────────────────────────────────────────────────

export function computeAnalytics(allGuildReviews: TicketReviewRecord[], period: ReviewPeriod): ReviewAnalytics {
  // ── Period-filtered subset ─────────────────────────────────────────────────
  const since   = periodCutoff(period);
  const reviews = allGuildReviews.filter(r => r.reviewedAt >= since);

  const totalReviews = reviews.length;
  const avgRating    = fmtAvg(reviews.map(r => r.rating));

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of reviews) distribution[r.rating - 1]++;

  // ── Trend (full dataset, unfiltered) ──────────────────────────────────────
  const now = Date.now();
  const todayCut = (() => { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d.getTime(); })();
  const trend = {
    today:   trendSlice(allGuildReviews, todayCut),
    week:    trendSlice(allGuildReviews, now - 7  * 24 * 60 * 60 * 1000),
    month:   trendSlice(allGuildReviews, now - 30 * 24 * 60 * 60 * 1000),
    allTime: trendSlice(allGuildReviews, 0),
  };

  // ── Staff analytics ────────────────────────────────────────────────────────
  type Bucket = { ratings: number[]; respMs: number[]; resMs: number[] };
  const staffMap = new Map<string, Bucket>();
  for (const r of reviews) {
    if (!r.closedBy) continue;
    if (!staffMap.has(r.closedBy)) staffMap.set(r.closedBy, { ratings: [], respMs: [], resMs: [] });
    const b = staffMap.get(r.closedBy)!;
    b.ratings.push(r.rating);
    if (r.responseTimeMs  !== undefined) b.respMs.push(r.responseTimeMs);
    if (r.resolutionTimeMs !== undefined) b.resMs.push(r.resolutionTimeMs);
  }
  const staffStats: StaffStat[] = Array.from(staffMap.entries()).map(([userId, b]) => ({
    userId,
    totalReviews:   b.ratings.length,
    avgRating:      fmtAvg(b.ratings),
    avgResponseMs:  b.respMs.length  ? Math.round(avgOf(b.respMs))  : undefined,
    avgResolutionMs: b.resMs.length  ? Math.round(avgOf(b.resMs))   : undefined,
  })).sort((a, b) => b.totalReviews - a.totalReviews);

  const qualified = staffStats.filter(s => s.totalReviews >= 2);
  const byRating  = [...qualified].sort((a, b) => b.avgRating - a.avgRating);
  const byCount   = [...staffStats].sort((a, b) => b.totalReviews - a.totalReviews);

  const topRated     = byRating.slice(0, 5);
  const mostReviewed = byCount.slice(0, 5);
  const bestStaff    = byRating[0];
  const worstStaff   = byRating.length >= 2 ? byRating[byRating.length - 1] : undefined;

  // ── Ticket-type analytics ──────────────────────────────────────────────────
  const typeMap = new Map<string, Bucket>();
  for (const r of reviews) {
    if (!typeMap.has(r.ticketType)) typeMap.set(r.ticketType, { ratings: [], respMs: [], resMs: [] });
    const b = typeMap.get(r.ticketType)!;
    b.ratings.push(r.rating);
    if (r.responseTimeMs  !== undefined) b.respMs.push(r.responseTimeMs);
    if (r.resolutionTimeMs !== undefined) b.resMs.push(r.resolutionTimeMs);
  }
  const typeStats: TypeStat[] = Array.from(typeMap.entries()).map(([ticketType, b]) => ({
    ticketType,
    totalReviews:    b.ratings.length,
    avgRating:       fmtAvg(b.ratings),
    avgResponseMs:   b.respMs.length ? Math.round(avgOf(b.respMs)) : undefined,
    avgResolutionMs: b.resMs.length  ? Math.round(avgOf(b.resMs))  : undefined,
  })).sort((a, b) => b.avgRating - a.avgRating);

  return {
    period,
    totalReviews,
    avgRating,
    distribution,
    trend,
    staffStats,
    typeStats,
    topRated,
    mostReviewed,
    bestStaff,
    worstStaff,
  };
}
