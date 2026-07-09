import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import type { UserPreferences } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PREFS_FILE = path.join(DATA_DIR, 'preferences.json');

export class MemoryStorage {
  private async ensureDir(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  // ── Generic key-value storage ─────────────────────────────────────────────

  async load<T>(key: string): Promise<T | null> {
    const file = path.join(DATA_DIR, `${key}.json`);
    try {
      await this.ensureDir();
      const raw = await fs.readFile(file, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      logger.error(`Failed to load "${key}" from disk`, err);
      return null;
    }
  }

  async save<T>(key: string, data: T): Promise<void> {
    const file = path.join(DATA_DIR, `${key}.json`);
    try {
      await this.ensureDir();
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`Failed to save "${key}" to disk`, err);
    }
  }

  // ── Preferences (legacy specific methods) ─────────────────────────────────

  async loadPreferences(): Promise<Map<string, UserPreferences>> {
    try {
      await this.ensureDir();
      const raw = await fs.readFile(PREFS_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, UserPreferences>;
      return new Map(Object.entries(data));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
      logger.error('Failed to load preferences from disk', err);
      return new Map();
    }
  }

  async savePreferences(prefs: Map<string, UserPreferences>): Promise<void> {
    try {
      await this.ensureDir();
      const data = Object.fromEntries(prefs.entries());
      await fs.writeFile(PREFS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to save preferences to disk', err);
    }
  }
}
