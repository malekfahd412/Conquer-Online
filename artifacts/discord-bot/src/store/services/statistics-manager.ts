// ─────────────────────────────────────────────────────────────────────────────
// Statistics Manager — tracks store metrics
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreStatistics, OrderStatus } from '../models/index.js';
import { StoreJson } from './store-data.js';

const store = new StoreJson<StoreStatistics>('statistics.json', () => ({
  totalOrders: 0,
  completed: 0,
  cancelled: 0,
  revenue: 0,
  pending: 0,
}));

export const statisticsManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async read(): Promise<StoreStatistics> {
    return store.read();
  },

  async increment(field: keyof Omit<StoreStatistics, 'revenue'>): Promise<void> {
    await store.mutate(data => {
      data[field] += 1;
    });
  },

  async decrement(field: keyof Omit<StoreStatistics, 'revenue'>): Promise<void> {
    await store.mutate(data => {
      if (data[field] > 0) data[field] -= 1;
    });
  },

  async addRevenue(amount: number): Promise<void> {
    await store.mutate(data => {
      data.revenue += amount;
    });
  },

  async onStatusChange(prevStatus: OrderStatus, newStatus: OrderStatus, totalPrice: number): Promise<void> {
    await store.mutate(data => {
      // Remove from pending when leaving WaitingPayment / Pending
      if ((prevStatus === 'Pending' || prevStatus === 'WaitingPayment') && newStatus !== prevStatus) {
        if (data.pending > 0) data.pending -= 1;
      }

      if (newStatus === 'Completed') {
        data.completed += 1;
        data.revenue += totalPrice;
      } else if (newStatus === 'Cancelled' || newStatus === 'Refunded') {
        data.cancelled += 1;
        if (newStatus === 'Refunded') {
          data.revenue = Math.max(0, data.revenue - totalPrice);
        }
      } else if (newStatus === 'WaitingPayment' || newStatus === 'Pending') {
        data.pending += 1;
      }
    });
  },
};
