// ─────────────────────────────────────────────────────────────────────────────
// Settings Manager — persists store-wide configuration
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreSettings } from '../models/index.js';
import { StoreJson } from './store-data.js';

const store = new StoreJson<StoreSettings>('settings.json', () => ({
  supportRoles: [],
  adminRoles: [],
  panelChannelId: null,
  panelMessageId: null,
  orderCategoryId: null,
}));

export const settingsManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async read(): Promise<StoreSettings> {
    return store.read();
  },

  async update(patch: Partial<StoreSettings>): Promise<StoreSettings> {
    return store.mutate(data => {
      Object.assign(data, patch);
      return JSON.parse(JSON.stringify(data)) as StoreSettings;
    });
  },
};
