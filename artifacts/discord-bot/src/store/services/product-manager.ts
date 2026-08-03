// ─────────────────────────────────────────────────────────────────────────────
// Product Manager — CRUD for store products
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreProduct, ProductsData } from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';

const store = new StoreJson<ProductsData>('products.json', () => ({ products: [] }));

export const productManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(): Promise<StoreProduct[]> {
    const data = await store.read();
    return data.products.slice();
  },

  async listByCategory(categoryId: string): Promise<StoreProduct[]> {
    const data = await store.read();
    return data.products.filter(p => p.categoryId === categoryId);
  },

  async listVisible(categoryId: string): Promise<StoreProduct[]> {
    const all = await this.listByCategory(categoryId);
    return all.filter(p => p.enabled && !p.hidden);
  },

  async get(id: string): Promise<StoreProduct | undefined> {
    const data = await store.read();
    return data.products.find(p => p.id === id);
  },

  async create(input: Omit<StoreProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoreProduct> {
    return store.mutate(data => {
      const now = Date.now();
      const product: StoreProduct = {
        id: genStoreId('prod'),
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      data.products.push(product);
      return JSON.parse(JSON.stringify(product)) as StoreProduct;
    });
  },

  async update(id: string, patch: Partial<Omit<StoreProduct, 'id' | 'createdAt'>>): Promise<StoreProduct | undefined> {
    return store.mutate(data => {
      const idx = data.products.findIndex(p => p.id === id);
      if (idx === -1) return undefined;
      Object.assign(data.products[idx], { ...patch, updatedAt: Date.now() });
      return JSON.parse(JSON.stringify(data.products[idx])) as StoreProduct;
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
    return product.stock >= quantity;
  },
};
