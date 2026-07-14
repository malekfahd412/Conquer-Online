import { promises as fs } from 'fs';
import path from 'path';

// ── Data shape ────────────────────────────────────────────────────────────

export interface TempRoleEntry {
  /**
   * Composite key: "{guildId}:{userId}:{roleId}".
   * Uniquely identifies a user/role pair per guild so duplicate timers are
   * naturally prevented — upserting replaces the previous entry.
   */
  id: string;
  guildId: string;
  userId: string;
  roleId: string;
  /** Duration in ms originally requested — kept for log embeds. */
  durationMs: number;
  /** Unix epoch ms when the role should be removed. */
  expiresAt: number;
  /** Unix epoch ms when the role was granted. */
  createdAt: number;
  /** Snowflake of the moderator who granted the role. */
  moderatorId: string;
}

// ── Persistence ───────────────────────────────────────────────────────────

const DATA_PATH = path.join(process.cwd(), 'data', 'temporary-roles.json');

async function load(): Promise<TempRoleEntry[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TempRoleEntry[];
  } catch { /* first run or empty file */ }
  return [];
}

async function save(entries: TempRoleEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────────────

export function makeEntryId(guildId: string, userId: string, roleId: string): string {
  return `${guildId}:${userId}:${roleId}`;
}

/** Insert or replace a temp-role entry (duplicate prevention). */
export async function upsertTempRole(entry: TempRoleEntry): Promise<void> {
  const entries = await load();
  const idx = entries.findIndex(e => e.id === entry.id);
  if (idx !== -1) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  await save(entries);
}

/** Remove a single entry by its composite ID. */
export async function removeTempRole(id: string): Promise<void> {
  const entries = await load();
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length !== entries.length) await save(filtered);
}

/** Remove all temp-role entries for a member leaving. Returns removed IDs. */
export async function removeTempRolesForMember(guildId: string, userId: string): Promise<string[]> {
  const entries = await load();
  const hit = entries.filter(e => e.guildId === guildId && e.userId === userId);
  if (hit.length === 0) return [];
  await save(entries.filter(e => !(e.guildId === guildId && e.userId === userId)));
  return hit.map(e => e.id);
}

/** Remove all temp-role entries for a deleted role. Returns removed IDs. */
export async function removeTempRolesForRole(guildId: string, roleId: string): Promise<string[]> {
  const entries = await load();
  const hit = entries.filter(e => e.guildId === guildId && e.roleId === roleId);
  if (hit.length === 0) return [];
  await save(entries.filter(e => !(e.guildId === guildId && e.roleId === roleId)));
  return hit.map(e => e.id);
}

/** Remove all temp-role entries for a deleted/unavailable guild. Returns removed IDs. */
export async function removeTempRolesForGuild(guildId: string): Promise<string[]> {
  const entries = await load();
  const hit = entries.filter(e => e.guildId === guildId);
  if (hit.length === 0) return [];
  await save(entries.filter(e => e.guildId !== guildId));
  return hit.map(e => e.id);
}

/** Return all stored temp-role entries. */
export async function getAllTempRoles(): Promise<TempRoleEntry[]> {
  return load();
}

/** Return a single entry by its composite ID, or undefined if not found. */
export async function getTempRole(id: string): Promise<TempRoleEntry | undefined> {
  const entries = await load();
  return entries.find(e => e.id === id);
}

/** Return all temp-role entries for a specific guild. */
export async function getTempRolesForGuild(guildId: string): Promise<TempRoleEntry[]> {
  const entries = await load();
  return entries.filter(e => e.guildId === guildId);
}
