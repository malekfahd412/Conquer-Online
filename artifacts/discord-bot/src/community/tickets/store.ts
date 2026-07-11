// ─────────────────────────────────────────────────────────────────────────────
// Generic JSON file store. Each engine owns exactly one instance of this,
// pointed at its own file under data/tickets/. No engine reaches into another
// engine's file — cross-engine data flows only through public method calls.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';

const TICKETS_DATA_DIR = path.join(process.cwd(), 'data', 'tickets');

export class JsonStore<T> {
  private readonly filePath: string;
  private cache: T | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    fileName: string,
    private readonly defaultValue: () => T,
  ) {
    this.filePath = path.join(TICKETS_DATA_DIR, fileName);
  }

  /** Creates the backing file with its default contents if it doesn't exist yet. */
  async ensureFile(): Promise<void> {
    try {
      await fs.access(this.filePath);
    } catch {
      await this.mutate(() => undefined);
    }
  }

  async read(): Promise<T> {
    if (this.cache !== undefined) return this.cache;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.cache = JSON.parse(raw) as T;
    } catch {
      this.cache = this.defaultValue();
    }
    return this.cache;
  }

  /** Read-modify-write, serialized so concurrent callers never clobber each other. */
  async mutate<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      const data = await this.read();
      const result = await fn(data);
      this.cache = data;
      await fs.mkdir(TICKETS_DATA_DIR, { recursive: true });
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

export function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function legacyDataPath(): string {
  return path.join(process.cwd(), 'data', 'tickets.json');
}

export { TICKETS_DATA_DIR };
