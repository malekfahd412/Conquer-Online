// ─────────────────────────────────────────────────────────────────────────────
// Statistics Manager — store metrics (Phase 1 + Phase 2).
// Adds daily/weekly/monthly revenue buckets, top products, top customers,
// and top staff tracking.
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreStatistics, OrderStatus } from '../models/index.js';
import { StoreJson } from './store-data.js';

function normalizeStats(s: Partial<StoreStatistics>): StoreStatistics {
  return {
    totalOrders: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    pending: 0,
    refunded: 0,
    delivering: 0,
    proofSubmitted: 0,
    preparing: 0,
    dailyRevenue: {},
    weeklyRevenue: {},
    monthlyRevenue: {},
    topProducts: {},
    topCustomers: {},
    topStaff: {},
    ...s,
  };
}

const store = new StoreJson<StoreStatistics>('statistics.json', () => normalizeStats({}));

function dateBucket(): { day: string; week: string; month: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  // ISO week number
  const tmp = new Date(Date.UTC(year, month - 1, day));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return {
    day: `${year}-${pad(month)}-${pad(day)}`,
    week: `${year}-W${pad(weekNum)}`,
    month: `${year}-${pad(month)}`,
  };
}

export const statisticsManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async read(): Promise<StoreStatistics> {
    const data = await store.read();
    return normalizeStats(data);
  },

  async increment(field: keyof Omit<StoreStatistics, 'revenue' | 'dailyRevenue' | 'weeklyRevenue' | 'monthlyRevenue' | 'topProducts' | 'topCustomers' | 'topStaff'>): Promise<void> {
    await store.mutate(data => {
      const s = normalizeStats(data);
      s[field] = (s[field] as number) + 1;
      Object.assign(data, s);
    });
  },

  async decrement(field: keyof Omit<StoreStatistics, 'revenue' | 'dailyRevenue' | 'weeklyRevenue' | 'monthlyRevenue' | 'topProducts' | 'topCustomers' | 'topStaff'>): Promise<void> {
    await store.mutate(data => {
      const s = normalizeStats(data);
      if ((s[field] as number) > 0) s[field] = (s[field] as number) - 1;
      Object.assign(data, s);
    });
  },

  async addRevenue(amount: number, productId?: string): Promise<void> {
    const { day, week, month } = dateBucket();
    await store.mutate(data => {
      const s = normalizeStats(data);
      s.revenue += amount;
      s.dailyRevenue[day] = (s.dailyRevenue[day] ?? 0) + amount;
      s.weeklyRevenue[week] = (s.weeklyRevenue[week] ?? 0) + amount;
      s.monthlyRevenue[month] = (s.monthlyRevenue[month] ?? 0) + amount;
      if (productId) {
        s.topProducts[productId] = (s.topProducts[productId] ?? 0) + amount;
      }
      Object.assign(data, s);
    });
  },

  async trackCustomer(userId: string): Promise<void> {
    await store.mutate(data => {
      const s = normalizeStats(data);
      s.topCustomers[userId] = (s.topCustomers[userId] ?? 0) + 1;
      Object.assign(data, s);
    });
  },

  async trackStaff(staffId: string): Promise<void> {
    await store.mutate(data => {
      const s = normalizeStats(data);
      s.topStaff[staffId] = (s.topStaff[staffId] ?? 0) + 1;
      Object.assign(data, s);
    });
  },

  async onStatusChange(
    prevStatus: OrderStatus,
    newStatus: OrderStatus,
    totalPrice: number,
    staffId?: string,
  ): Promise<void> {
    const { day, week, month } = dateBucket();
    await store.mutate(data => {
      const s = normalizeStats(data);

      // Remove from pending
      if ((prevStatus === 'Pending' || prevStatus === 'WaitingPayment' || prevStatus === 'ProofSubmitted') &&
          newStatus !== prevStatus) {
        if (s.pending > 0) s.pending -= 1;
      }
      if (prevStatus === 'ProofSubmitted') {
        if (s.proofSubmitted > 0) s.proofSubmitted -= 1;
      }
      if (prevStatus === 'Preparing') {
        if (s.preparing > 0) s.preparing -= 1;
      }
      if (prevStatus === 'Delivering') {
        if (s.delivering > 0) s.delivering -= 1;
      }

      // Update new status counters
      if (newStatus === 'Completed') {
        s.completed += 1;
        s.revenue += totalPrice;
        s.dailyRevenue[day] = (s.dailyRevenue[day] ?? 0) + totalPrice;
        s.weeklyRevenue[week] = (s.weeklyRevenue[week] ?? 0) + totalPrice;
        s.monthlyRevenue[month] = (s.monthlyRevenue[month] ?? 0) + totalPrice;
        if (staffId) s.topStaff[staffId] = (s.topStaff[staffId] ?? 0) + 1;
      } else if (newStatus === 'Cancelled') {
        s.cancelled += 1;
      } else if (newStatus === 'Refunded') {
        s.refunded = (s.refunded ?? 0) + 1;
        s.cancelled += 1;
        s.revenue = Math.max(0, s.revenue - totalPrice);
      } else if (newStatus === 'WaitingPayment' || newStatus === 'Pending') {
        s.pending += 1;
      } else if (newStatus === 'ProofSubmitted') {
        s.proofSubmitted = (s.proofSubmitted ?? 0) + 1;
      } else if (newStatus === 'Preparing') {
        s.preparing = (s.preparing ?? 0) + 1;
      } else if (newStatus === 'Delivering') {
        s.delivering = (s.delivering ?? 0) + 1;
      }

      Object.assign(data, s);
    });
  },

  /** Return top N entries from a Record<id, count> map sorted descending. */
  getTopN(map: Record<string, number>, n = 5): Array<{ id: string; count: number }> {
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([id, count]) => ({ id, count }));
  },

  /** Trim time-series buckets older than retentionDays. */
  async trimOldBuckets(retentionDays = 90): Promise<void> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    await store.mutate(data => {
      const s = normalizeStats(data);
      for (const key of Object.keys(s.dailyRevenue)) {
        if (key < cutoffStr) delete s.dailyRevenue[key];
      }
      Object.assign(data, s);
    });
  },
};
