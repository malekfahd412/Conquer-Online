import { MemoryStorage } from './MemoryStorage';
import type { UserPreferences } from './types';
import { logger } from '../../utils/logger';

type PrefKey = keyof Omit<UserPreferences, 'updatedAt'>;

export class LongTermMemory {
  private prefs = new Map<string, UserPreferences>();

  constructor(private readonly storage: MemoryStorage) {}

  async load(): Promise<void> {
    this.prefs = await this.storage.loadPreferences();
    logger.success(`Long-term memory loaded — ${this.prefs.size} user profile(s)`);
  }

  get(userId: string): UserPreferences | null {
    return this.prefs.get(userId) ?? null;
  }

  async set(userId: string, key: PrefKey, value: unknown): Promise<void> {
    const existing = this.prefs.get(userId) ?? { updatedAt: Date.now() };
    this.prefs.set(userId, { ...existing, [key]: value, updatedAt: Date.now() });
    await this.storage.savePreferences(this.prefs);
  }

  async reset(userId: string): Promise<void> {
    this.prefs.delete(userId);
    await this.storage.savePreferences(this.prefs);
  }

  size(): number {
    return this.prefs.size;
  }
}
