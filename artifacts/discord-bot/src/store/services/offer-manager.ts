// ─────────────────────────────────────────────────────────────────────────────
// Offer Manager — special offers: flash sales, bundles, featured products.
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreOffer, OffersData } from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';

const store = new StoreJson<OffersData>('offers.json', () => ({ offers: [] }));

export const offerManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(): Promise<StoreOffer[]> {
    const data = await store.read();
    return data.offers.slice().sort((a, b) => b.createdAt - a.createdAt);
  },

  async listActive(): Promise<StoreOffer[]> {
    const now = Date.now();
    const data = await store.read();
    return data.offers.filter(o => {
      if (!o.enabled) return false;
      if (o.startAt !== undefined && o.startAt > now) return false;
      if (o.endAt !== undefined && o.endAt < now) return false;
      return true;
    });
  },

  async listForProduct(productId: string): Promise<StoreOffer[]> {
    const active = await this.listActive();
    return active.filter(o => o.productIds.includes(productId));
  },

  async get(id: string): Promise<StoreOffer | undefined> {
    const data = await store.read();
    return data.offers.find(o => o.id === id);
  },

  async create(input: Omit<StoreOffer, 'id' | 'createdAt'>): Promise<StoreOffer> {
    return store.mutate(data => {
      const offer: StoreOffer = {
        ...input,
        id: genStoreId('of'),
        createdAt: Date.now(),
      };
      data.offers.push(offer);
      return JSON.parse(JSON.stringify(offer)) as StoreOffer;
    });
  },

  async update(id: string, patch: Partial<Omit<StoreOffer, 'id' | 'createdAt'>>): Promise<StoreOffer | undefined> {
    return store.mutate(data => {
      const o = data.offers.find(x => x.id === id);
      if (!o) return undefined;
      Object.assign(o, patch);
      return JSON.parse(JSON.stringify(o)) as StoreOffer;
    });
  },

  async delete(id: string): Promise<boolean> {
    return store.mutate(data => {
      const idx = data.offers.findIndex(o => o.id === id);
      if (idx === -1) return false;
      data.offers.splice(idx, 1);
      return true;
    });
  },

  /** Returns the effective discount % for a product from active flash-sale offers. */
  async getFlashSaleDiscount(productId: string): Promise<number> {
    const offers = await this.listForProduct(productId);
    const flashSales = offers.filter(o => o.type === 'flash_sale' && o.discountPercent !== undefined);
    if (flashSales.length === 0) return 0;
    return Math.max(...flashSales.map(o => o.discountPercent ?? 0));
  },
};
