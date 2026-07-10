import { promises as fs } from 'fs';
import path from 'path';

export interface ChannelBackup {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId: string | null;
  topic?: string | null;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  permissionOverwrites: Array<{ id: string; type: number; allow: string; deny: string }>;
}

export interface RoleBackup {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string;
  position: number;
}

export interface EmojiBackup {
  id: string | null;
  name: string | null;
  imageURL?: string;
  animated: boolean;
  roles: string[];
}

export interface GuildBackup {
  id: string;
  name: string;
  description: string | null;
  icon?: string | null;
  banner?: string | null;
  verificationLevel: number;
  defaultMessageNotifications: number;
  explicitContentFilter: number;
  afkTimeout: number;
  systemChannelId: string | null;
  preferredLocale: string;
  categories: ChannelBackup[];
  channels: ChannelBackup[];
  roles: RoleBackup[];
  emojis: EmojiBackup[];
}

export interface ServerBackup {
  id: string;
  label: string;
  type: 'full' | 'incremental' | 'snapshot';
  guildId: string;
  guildName: string;
  data: GuildBackup;
  createdAt: number;
  size?: number;
  description?: string;
  parentId?: string; // for incremental backups
}

interface BackupStore {
  backups: ServerBackup[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'server-backups.json');

async function load(): Promise<BackupStore> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as BackupStore;
  } catch {
    return { backups: [] };
  }
}

async function save(store: BackupStore): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function makeId(): string {
  return `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveBackup(backup: Omit<ServerBackup, 'id' | 'createdAt'>): Promise<ServerBackup> {
  const store = await load();
  const entry: ServerBackup = { ...backup, id: makeId(), createdAt: Date.now() };
  const json = JSON.stringify(entry.data);
  entry.size = json.length;
  store.backups.push(entry);
  await save(store);
  return entry;
}

export async function getBackup(id: string): Promise<ServerBackup | undefined> {
  const store = await load();
  return store.backups.find(b => b.id === id || b.label.toLowerCase() === id.toLowerCase());
}

export async function listBackups(guildId?: string): Promise<ServerBackup[]> {
  const store = await load();
  const list = guildId ? store.backups.filter(b => b.guildId === guildId) : store.backups;
  return list.sort((a, b) => b.createdAt - a.createdAt).map(b => ({ ...b, data: undefined as unknown as GuildBackup }));
}

export async function listBackupsFull(guildId?: string): Promise<ServerBackup[]> {
  const store = await load();
  const list = guildId ? store.backups.filter(b => b.guildId === guildId) : store.backups;
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteBackup(id: string): Promise<boolean> {
  const store = await load();
  const before = store.backups.length;
  store.backups = store.backups.filter(b => b.id !== id && b.label.toLowerCase() !== id.toLowerCase());
  if (store.backups.length < before) { await save(store); return true; }
  return false;
}

export async function cleanupOldBackups(guildId: string, keepCount: number): Promise<number> {
  const store = await load();
  const guild = store.backups.filter(b => b.guildId === guildId).sort((a, b) => b.createdAt - a.createdAt);
  if (guild.length <= keepCount) return 0;
  const toDelete = new Set(guild.slice(keepCount).map(b => b.id));
  const before = store.backups.length;
  store.backups = store.backups.filter(b => !toDelete.has(b.id));
  await save(store);
  return before - store.backups.length;
}
