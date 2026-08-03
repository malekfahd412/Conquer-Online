// ─────────────────────────────────────────────────────────────────────────────
// Generic JSON persistence layer for the Store module.
// Mirrors the pattern from src/community/tickets/store.ts but targets
// data/store/ so it never touches the ticket data directory.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';

export const STORE_DATA_DIR = path.join(process.cwd(), 'data', 'store');

export class StoreJson<T> {
  private readonly filePath: string;
  private cache: T | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    fileName: string,
    private readonly defaultValue: () => T,
  ) {
    this.filePath = path.join(STORE_DATA_DIR, fileName);
  }

  /** Creates the backing file with default contents if it does not exist. */
  async ensureFile(): Promise<void> {
    await fs.mkdir(STORE_DATA_DIR, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await this.mutate(() => undefined);
    }
  }

  async read(): Promise<T> {
    if (this.cache !== undefined) return JSON.parse(JSON.stringify(this.cache)) as T;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.cache = JSON.parse(raw) as T;
    } catch {
      this.cache = this.defaultValue();
    }
    return JSON.parse(JSON.stringify(this.cache)) as T;
  }

  /**
   * Read-modify-write, serialised via a write queue so concurrent callers
   * never clobber each other.
   */
  async mutate<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      const data = await this.read();
      const result = await fn(data);
      this.cache = data;
      await fs.mkdir(STORE_DATA_DIR, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return result;
    };
    const resultPromise = this.writeQueue.then(run, run);
    this.writeQueue = resultPromise.then(
      () => undefined,
      () => undefined,
    );
    return resultPromise;
  }
}

/** Generate a short random ID with a given prefix. */
export function genStoreId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
