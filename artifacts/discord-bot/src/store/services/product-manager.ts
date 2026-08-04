// ─────────────────────────────────────────────────────────────────────────────
// Product Manager — CRUD for store products (Phase 1 + Phase 2).
// Adds variant management, gallery images, tags, badges, scheduling,
// reserved stock tracking, low-stock detection, and sales counters.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  StoreProduct,
  ProductsData,
  ProductVariant,
  ProductBadge,
} from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';

const store = new StoreJson<ProductsData>('products.json', () => ({ products: [] }));

function applyDefaults(p: Partial<StoreProduct> & { id: string; name: string; price: number; currency: string }): StoreProduct {
  return {
    categoryId: '',
    description: '',
    stock: 0,
    unlimitedStock: false,
    enabled: true,
    featured: false,
    hidden: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variants: [],
    galleryImages: [],
    tags: [],
    badges: [],
    reservedStock: 0,
    lowStockThreshold: 0,
    viewCount: 0,
    salesCount: 0,
    ...p,
  };
}

export const productManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(): Promise<StoreProduct[]> {
    const data = await store.read();
    return data.products.map(applyDefaults);
  },

  async listByCategory(categoryId: string): Promise<StoreProduct[]> {
    const all = await this.list();
    return all.filter(p => p.categoryId === categoryId);
  },

  async listVisible(categoryId: string): Promise<StoreProduct[]> {
    const all = await this.listByCategory(categoryId);
    const now = Date.now();
    return all.filter(p => {
      if (!p.enabled || p.hidden) return false;
      if (p.scheduledAt !== undefined && p.scheduledAt > now) return false;
      return true;
    });
  },

  async listFeatured(): Promise<StoreProduct[]> {
    const all = await this.list();
    return all.filter(p => p.featured && p.enabled && !p.hidden);
  },

  async get(id: string): Promise<StoreProduct | undefined> {
    const data = await store.read();
    const p = data.products.find(x => x.id === id);
    return p ? applyDefaults(p) : undefined;
  },

  async create(
    input: Omit<StoreProduct, 'id' | 'createdAt' | 'updatedAt' | 'variants' | 'galleryImages' | 'tags' | 'badges' | 'reservedStock' | 'lowStockThreshold' | 'viewCount' | 'salesCount'> &
      Partial<Pick<StoreProduct, 'variants' | 'galleryImages' | 'tags' | 'badges' | 'lowStockThreshold'>>,
  ): Promise<StoreProduct> {
    return store.mutate(data => {
      const now = Date.now();
      const product: StoreProduct = applyDefaults({
        id: genStoreId('prod'),
        ...input,
        createdAt: now,
        updatedAt: now,
      });
      data.products.push(product);
      return JSON.parse(JSON.stringify(product)) as StoreProduct;
    });
  },

  async update(id: string, patch: Partial<Omit<StoreProduct, 'id' | 'createdAt'>>): Promise<StoreProduct | undefined> {
    return store.mutate(data => {
      const idx = data.products.findIndex(p => p.id === id);
      if (idx === -1) return undefined;
      Object.assign(data.products[idx], { ...patch, updatedAt: Date.now() });
      return JSON.parse(JSON.stringify(applyDefaults(data.products[idx]))) as StoreProduct;
    });
  },

  async delete(id: string): Promise<boolean> {
    return store.mutate(data => {
      const before = data.products.length;
      data.products = data.products.filter(p => p.id !== id);
      return data.products.length < before;
    });
  },

  async setStock(id: string, amount: number): Promise<void> {
    if (amount < 0) {
      await this.update(id, { unlimitedStock: true, stock: 0 });
    } else {
      await this.update(id, { unlimitedStock: false, stock: amount });
    }
  },

  async decrementStock(id: string, quantity: number): Promise<void> {
    await store.mutate(data => {
      const product = data.products.find(p => p.id === id);
      if (!product || product.unlimitedStock) return;
      product.stock = Math.max(0, product.stock - quantity);
      product.updatedAt = Date.now();
    });
  },

  async incrementSalesCount(id: string, quantity: number): Promise<void> {
    await store.mutate(data => {
      const product = data.products.find(p => p.id === id);
      if (!product) return;
      product.salesCount = (product.salesCount ?? 0) + quantity;
      product.updatedAt = Date.now();
    });
  },

  async incrementViewCount(id: string): Promise<void> {
    await store.mutate(data => {
      const product = data.products.find(p => p.id === id);
      if (!product) return;
      product.viewCount = (product.viewCount ?? 0) + 1;
    });
  },

  async toggleHidden(id: string): Promise<boolean | undefined> {
    return store.mutate(data => {
      const product = data.products.find(p => p.id === id);
      if (!product) return undefined;
      product.hidden = !product.hidden;
      product.updatedAt = Date.now();
      return product.hidden;
    });
  },

  isInStock(product: StoreProduct, quantity: number): boolean {
    if (product.unlimitedStock) return true;
    const available = product.stock - product.reservedStock;
    return available >= quantity;
  },

  /** Reserve stock when an order is created. */
  async reserveStock(id: string, quantity: number): Promise<void> {
    await store.mutate(data => {
      const product = data.products.find(p => p.id === id);
      if (!product || product.unlimitedStock) return;
      product.reservedStock = (product.reservedStock ?? 0) + quantity;
    });
  },

  /** Release reserved stock (on cancel/refund). */
  async releaseReservedStock(id: string, quantity: number): Promise<void> {
    await store.mutate(data => {
      const product = data.products.find(p => p.id === id);
      if (!product || product.unlimitedStock) return;
      product.reservedStock = Math.max(0, (product.reservedStock ?? 0) - quantity);
    });
  },

  // ── Variant management ──────────────────────────────────────────────────────

  async addVariant(productId: string, variant: Omit<ProductVariant, 'id'>): Promise<ProductVariant | undefined> {
    return store.mutate(data => {
      const product = data.products.find(p => p.id === productId);
      if (!product) return undefined;
      if (!product.variants) product.variants = [];
      const v: ProductVariant = { id: genStoreId('var'), ...variant };
      product.variants.push(v);
      product.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(v)) as ProductVariant;
    });
  },

  async updateVariant(productId: string, variantId: string, patch: Partial<Omit<ProductVariant, 'id'>>): Promise<ProductVariant | undefined> {
    return store.mutate(data => {
      const product = data.products.find(p => p.id === productId);
      if (!product?.variants) return undefined;
      const v = product.variants.find(x => x.id === variantId);
      if (!v) return undefined;
      Object.assign(v, patch);
      product.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(v)) as ProductVariant;
    });
  },

  async removeVariant(productId: string, variantId: string): Promise<boolean> {
    return store.mutate(data => {
      const product = data.products.find(p => p.id === productId);
      if (!product?.variants) return false;
      const before = product.variants.length;
      product.variants = product.variants.filter(v => v.id !== variantId);
      product.updatedAt = Date.now();
      return product.variants.length < before;
    });
  },

  async getVariant(productId: string, variantId: string): Promise<ProductVariant | undefined> {
    const product = await this.get(productId);
    return product?.variants?.find(v => v.id === variantId);
  },

  // ── Badge management ────────────────────────────────────────────────────────

  async setBadges(productId: string, badges: ProductBadge[]): Promise<void> {
    await this.update(productId, { badges });
  },

  async addBadge(productId: string, badge: ProductBadge): Promise<void> {
    const product = await this.get(productId);
    if (!product) return;
    const badges = [...new Set([...(product.badges ?? []), badge])];
    await this.update(productId, { badges });
  },

  async removeBadge(productId: string, badge: ProductBadge): Promise<void> {
    const product = await this.get(productId);
    if (!product) return;
    await this.update(productId, { badges: (product.badges ?? []).filter(b => b !== badge) });
  },

  // ── Gallery management ──────────────────────────────────────────────────────

  async addGalleryImage(productId: string, url: string): Promise<void> {
    const product = await this.get(productId);
    if (!product) return;
    const images = [...(product.galleryImages ?? []), url].slice(0, 10);
    await this.update(productId, { galleryImages: images });
  },

  async removeGalleryImage(productId: string, url: string): Promise<void> {
    const product = await this.get(productId);
    if (!product) return;
    await this.update(productId, { galleryImages: (product.galleryImages ?? []).filter(i => i !== url) });
  },

  // ── Low stock detection ─────────────────────────────────────────────────────

  async getLowStockProducts(): Promise<StoreProduct[]> {
    const products = await this.list();
    return products.filter(p => {
      if (p.unlimitedStock || !p.enabled) return false;
      const threshold = p.lowStockThreshold ?? 0;
      if (threshold <= 0) return false;
      return p.stock <= threshold;
    });
  },

  async getOutOfStockProducts(): Promise<StoreProduct[]> {
    const products = await this.list();
    return products.filter(p => !p.unlimitedStock && p.enabled && p.stock <= 0);
  },
};
