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
