import { promises as fs } from 'fs';
import path from 'path';
import type { ModCase } from './types';

const DATA_PATH = path.join(process.cwd(), 'data', 'mod-cases.json');

// ── Persistence ────────────────────────────────────────────────────────────

interface CaseData {
  guilds: Record<string, ModCase[]>;
}

async function load(): Promise<CaseData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null) {
      return (parsed as unknown) as CaseData;
    }
  } catch { /* first run */ }
  return { guilds: {} };
}

async function save(data: CaseData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Add a brand-new case record. The id and timestamp must already be set. */
export async function storeCase(c: ModCase): Promise<void> {
  const data = await load();
  if (!data.guilds[c.guildId]) data.guilds[c.guildId] = [];
  data.guilds[c.guildId].push(c);
  await save(data);
}

/** Retrieve a single case by string ID (e.g. "MOD-0042"). Case-insensitive. */
export async function getCase(guildId: string, caseId: string): Promise<ModCase | null> {
  const data = await load();
  const needle = caseId.toUpperCase();
  return data.guilds[guildId]?.find(c => c.id.toUpperCase() === needle) ?? null;
}

/** Edit the reason of an existing case. Returns updated case or null if not found. */
export async function editCaseReason(
  guildId: string,
  caseId: string,
  reason: string,
): Promise<ModCase | null> {
  const data = await load();
  const cases = data.guilds[guildId];
  if (!cases) return null;
  const idx = cases.findIndex(c => c.id.toUpperCase() === caseId.toUpperCase());
  if (idx === -1) return null;
  cases[idx] = { ...cases[idx], reason };
  await save(data);
  return cases[idx];
}

/** Permanently delete a case. Returns true if found and deleted. */
export async function deleteCase(guildId: string, caseId: string): Promise<boolean> {
  const data = await load();
  const cases = data.guilds[guildId];
  if (!cases) return false;
  const idx = cases.findIndex(c => c.id.toUpperCase() === caseId.toUpperCase());
  if (idx === -1) return false;
  cases.splice(idx, 1);
  await save(data);
  return true;
}

/** All cases for a specific user in a guild, newest first. */
export async function getUserCases(guildId: string, userId: string): Promise<ModCase[]> {
  const data = await load();
  return (data.guilds[guildId] ?? [])
    .filter(c => c.targetId === userId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** Active warning count for a user in a guild. */
export async function getActiveWarnCount(guildId: string, userId: string): Promise<number> {
  const data = await load();
  return (data.guilds[guildId] ?? []).filter(
    c => c.targetId === userId && c.action === 'warn' && c.active,
  ).length;
}

/** All cases in a guild, newest first. */
export async function getGuildCases(guildId: string): Promise<ModCase[]> {
  const data = await load();
  return (data.guilds[guildId] ?? []).sort((a, b) => b.timestamp - a.timestamp);
}

/** Set active/inactive on a case (used for expiry and unwarn). */
export async function setCaseActive(guildId: string, caseId: string, active: boolean): Promise<void> {
  const data = await load();
  const cases = data.guilds[guildId];
  if (!cases) return;
  const idx = cases.findIndex(c => c.id.toUpperCase() === caseId.toUpperCase());
  if (idx !== -1) {
    cases[idx] = { ...cases[idx], active };
    await save(data);
  }
}

/** Deactivate all active warnings for a user (clearwarnings). */
export async function clearUserWarnings(guildId: string, userId: string): Promise<number> {
  const data = await load();
  const cases = data.guilds[guildId];
  if (!cases) return 0;
  let count = 0;
  for (const c of cases) {
    if (c.targetId === userId && c.action === 'warn' && c.active) {
      c.active = false;
      count++;
    }
  }
  if (count > 0) await save(data);
  return count;
}

/** All cases with a future expiresAt that are still active — for expiry manager. */
export async function getActiveTempCases(): Promise<ModCase[]> {
  const data = await load();
  const now = Date.now();
  return Object.values(data.guilds)
    .flat()
    .filter(c => c.active && c.expiresAt !== undefined && c.expiresAt > now);
}

/** Deactivate all already-expired cases (called on startup). Returns count fixed. */
export async function expireOverdueCases(): Promise<number> {
  const data = await load();
  const now = Date.now();
  let count = 0;
  for (const cases of Object.values(data.guilds)) {
    for (const c of cases) {
      if (c.active && c.expiresAt !== undefined && c.expiresAt <= now) {
        c.active = false;
        count++;
      }
    }
  }
  if (count > 0) await save(data);
  return count;
}
