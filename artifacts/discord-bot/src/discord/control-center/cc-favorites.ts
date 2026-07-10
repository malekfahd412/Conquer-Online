import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'cc-favorites.json');

type Store = Record<string, string[]>;

let store: Store = {};
let ready = false;

async function load(): Promise<void> {
  if (ready) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, 'utf-8');
    store = JSON.parse(raw) as Store;
  } catch {
    store = {};
  }
  ready = true;
}

async function save(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    logger.error('cc-favorites: save failed', err);
  }
}

export async function getFavorites(userId: string): Promise<string[]> {
  await load();
  return [...(store[userId] ?? [])];
}

export async function toggleFavorite(userId: string, toolName: string): Promise<boolean> {
  await load();
  const favs = store[userId] ?? [];
  const idx = favs.indexOf(toolName);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(toolName);
  }
  store[userId] = favs;
  await save();
  return idx < 0;
}

export async function isFavorite(userId: string, toolName: string): Promise<boolean> {
  await load();
  return (store[userId] ?? []).includes(toolName);
}
