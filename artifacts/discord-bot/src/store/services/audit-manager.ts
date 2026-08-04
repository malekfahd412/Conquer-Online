// ─────────────────────────────────────────────────────────────────────────────
// Audit Manager — logs every significant store action with staff, time,
// order, reason, and before/after values. Rotates to keep the latest 2000
// entries to prevent unbounded file growth.
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreAuditEntry, AuditAction, AuditData } from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';
import { logger } from '../../utils/logger.js';

const AUDIT_MAX_ENTRIES = 2000;

const store = new StoreJson<AuditData>('audit.json', () => ({ entries: [] }));

export interface AuditLogInput {
  action: AuditAction;
  staffId?: string;
  userId?: string;
  orderId?: string;
  productId?: string;
  categoryId?: string;
  couponId?: string;
  reason?: string;
  before?: string;
  after?: string;
}

export const auditManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  /** Append a new audit entry. Trims to the last AUDIT_MAX_ENTRIES automatically. */
  async log(input: AuditLogInput): Promise<StoreAuditEntry> {
    return store.mutate(data => {
      const entry: StoreAuditEntry = {
        id: genStoreId('aud'),
        timestamp: Date.now(),
        ...input,
      };
      data.entries.push(entry);

      // Rotate: keep only the most recent entries
      if (data.entries.length > AUDIT_MAX_ENTRIES) {
        data.entries = data.entries.slice(data.entries.length - AUDIT_MAX_ENTRIES);
      }

      logger.info(`[Store][Audit] ${entry.action}${entry.orderId ? ` order=${entry.orderId}` : ''}${entry.staffId ? ` by=${entry.staffId}` : ''}`);
      return JSON.parse(JSON.stringify(entry)) as StoreAuditEntry;
    });
  },

  async getAll(): Promise<StoreAuditEntry[]> {
    const data = await store.read();
    return data.entries.slice().reverse(); // newest first
  },

  async getRecent(limit = 50): Promise<StoreAuditEntry[]> {
    const data = await store.read();
    return data.entries.slice(-limit).reverse();
  },

  async getByOrder(orderId: string): Promise<StoreAuditEntry[]> {
    const data = await store.read();
    return data.entries
      .filter(e => e.orderId === orderId)
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  async getByStaff(staffId: string, limit = 100): Promise<StoreAuditEntry[]> {
    const data = await store.read();
    return data.entries
      .filter(e => e.staffId === staffId)
      .slice(-limit)
      .reverse();
  },

  async getByAction(action: AuditAction, limit = 100): Promise<StoreAuditEntry[]> {
    const data = await store.read();
    return data.entries
      .filter(e => e.action === action)
      .slice(-limit)
      .reverse();
  },
};
