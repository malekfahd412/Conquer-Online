// ─────────────────────────────────────────────────────────────────────────────
// Category Manager — CRUD for store categories
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreCategory, CategoriesData } from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';

const store = new StoreJson<CategoriesData>('categories.json', () => ({ categories: [] }));

export const categoryManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(): Promise<StoreCategory[]> {
    const data = await store.read();
    return data.categories.slice().sort((a, b) => a.order - b.order);
  },

  async listEnabled(): Promise<StoreCategory[]> {
    const all = await this.list();
    return all.filter(c => c.enabled);
  },

  async get(id: string): Promise<StoreCategory | undefined> {
    const data = await store.read();
    return data.categories.find(c => c.id === id);
  },

  async create(input: Omit<StoreCategory, 'id'>): Promise<StoreCategory> {
    return store.mutate(data => {
      const category: StoreCategory = { id: genStoreId('cat'), ...input };
      data.categories.push(category);
      return JSON.parse(JSON.stringify(category)) as StoreCategory;
    });
  },

  async update(id: string, patch: Partial<Omit<StoreCategory, 'id'>>): Promise<StoreCategory | undefined> {
    return store.mutate(data => {
      const idx = data.categories.findIndex(c => c.id === id);
      if (idx === -1) return undefined;
      Object.assign(data.categories[idx], patch);
      return JSON.parse(JSON.stringify(data.categories[idx])) as StoreCategory;
    });
  },

  async delete(id: string): Promise<boolean> {
    return store.mutate(data => {
      const before = data.categories.length;
      data.categories = data.categories.filter(c => c.id !== id);
      return data.categories.length < before;
    });
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.update(id, { enabled });
  },
};
