// ─────────────────────────────────────────────────────────────────────────────
// Coupon Manager — discount system for the store.
// Supports percentage, fixed-amount, and free-item coupons with role
// restrictions, expiry dates, limited uses, and first-purchase-only gates.
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreCoupon, CouponsData } from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';

const store = new StoreJson<CouponsData>('coupons.json', () => ({ coupons: [] }));

export interface CouponValidationResult {
  valid: boolean;
  reason?: string;
  coupon?: StoreCoupon;
  discountAmount: number;
}

export const couponManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(): Promise<StoreCoupon[]> {
    const data = await store.read();
    return data.coupons.slice().sort((a, b) => b.createdAt - a.createdAt);
  },

  async listActive(): Promise<StoreCoupon[]> {
    const now = Date.now();
    const data = await store.read();
    return data.coupons.filter(c => {
      if (!c.enabled) return false;
      if (c.expiresAt !== undefined && c.expiresAt < now) return false;
      if (c.maxUses !== undefined && c.usedCount >= c.maxUses) return false;
      return true;
    });
  },

  async get(id: string): Promise<StoreCoupon | undefined> {
    const data = await store.read();
    return data.coupons.find(c => c.id === id);
  },

  async getByCode(code: string): Promise<StoreCoupon | undefined> {
    const data = await store.read();
    return data.coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
  },

  async create(input: Omit<StoreCoupon, 'id' | 'usedCount' | 'createdAt'>): Promise<StoreCoupon> {
    return store.mutate(data => {
      const coupon: StoreCoupon = {
        ...input,
        code: input.code.toUpperCase(),
        id: genStoreId('cp'),
        usedCount: 0,
        createdAt: Date.now(),
      };
      data.coupons.push(coupon);
      return JSON.parse(JSON.stringify(coupon)) as StoreCoupon;
    });
  },

  async update(id: string, patch: Partial<Omit<StoreCoupon, 'id' | 'createdAt'>>): Promise<StoreCoupon | undefined> {
    return store.mutate(data => {
      const c = data.coupons.find(x => x.id === id);
      if (!c) return undefined;
      if (patch.code !== undefined) patch.code = patch.code.toUpperCase();
      Object.assign(c, patch);
      return JSON.parse(JSON.stringify(c)) as StoreCoupon;
    });
  },

  async delete(id: string): Promise<boolean> {
    return store.mutate(data => {
      const idx = data.coupons.findIndex(c => c.id === id);
      if (idx === -1) return false;
      data.coupons.splice(idx, 1);
      return true;
    });
  },

  async incrementUsage(id: string): Promise<void> {
    await store.mutate(data => {
      const c = data.coupons.find(x => x.id === id);
      if (c) c.usedCount += 1;
    });
  },

  /**
   * Validate a coupon code against an order.
   * @param code      Coupon code entered by the buyer
   * @param subtotal  Order subtotal before discount
   * @param memberRoleIds  Role IDs the buyer has
   * @param isFirstPurchase  Whether this is their first order
   */
  async validate(
    code: string,
    subtotal: number,
    memberRoleIds: string[],
    isFirstPurchase: boolean,
  ): Promise<CouponValidationResult> {
    const now = Date.now();
    const coupon = await this.getByCode(code);

    if (!coupon) {
      return { valid: false, reason: 'Coupon code not found.', discountAmount: 0 };
    }
    if (!coupon.enabled) {
      return { valid: false, reason: 'This coupon is currently disabled.', discountAmount: 0 };
    }
    if (coupon.expiresAt !== undefined && coupon.expiresAt < now) {
      return { valid: false, reason: 'This coupon has expired.', discountAmount: 0 };
    }
    if (coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, reason: 'This coupon has reached its maximum uses.', discountAmount: 0 };
    }
    if (coupon.firstPurchaseOnly && !isFirstPurchase) {
      return { valid: false, reason: 'This coupon is for first-time customers only.', discountAmount: 0 };
    }
    if (coupon.roleBased && coupon.allowedRoles.length > 0) {
      if (!coupon.allowedRoles.some(r => memberRoleIds.includes(r))) {
        return { valid: false, reason: 'You do not have the required role for this coupon.', discountAmount: 0 };
      }
    }
    if (coupon.minPurchaseAmount !== undefined && subtotal < coupon.minPurchaseAmount) {
      return {
        valid: false,
        reason: `Minimum purchase of ${coupon.minPurchaseAmount} required for this coupon.`,
        discountAmount: 0,
      };
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = Math.floor(subtotal * (coupon.value / 100));
      if (coupon.maxDiscountAmount !== undefined) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
      }
    } else if (coupon.type === 'fixed') {
      discountAmount = Math.min(coupon.value, subtotal);
    }
    // free_item is handled separately at order creation level

    return { valid: true, coupon, discountAmount };
  },
};
