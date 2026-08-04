// ─────────────────────────────────────────────────────────────────────────────
// Settings Manager — persists store-wide configuration (Phase 1 + Phase 2).
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreSettings } from '../models/index.js';
import { StoreJson } from './store-data.js';

function normalizeSettings(s: Partial<StoreSettings>): StoreSettings {
  return {
    supportRoles: [],
    adminRoles: [],
    panelChannelId: null,
    panelMessageId: null,
    orderCategoryId: null,
    auditLogChannelId: null,
    lowStockAlertChannelId: null,
    settingsPanelChannelId: null,
    settingsPanelMessageId: null,
    defaultCurrency: 'coins',
    maxOrdersPerUser: 0,
    ...s,
  };
}

const store = new StoreJson<StoreSettings>('settings.json', () => normalizeSettings({}));

export const settingsManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async read(): Promise<StoreSettings> {
    const data = await store.read();
    return normalizeSettings(data);
  },

  async update(patch: Partial<StoreSettings>): Promise<StoreSettings> {
    return store.mutate(data => {
      const merged = normalizeSettings({ ...data, ...patch });
      Object.assign(data, merged);
      return JSON.parse(JSON.stringify(merged)) as StoreSettings;
    });
  },
};
