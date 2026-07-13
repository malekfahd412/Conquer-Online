import { promises as fs } from 'fs';
import path from 'path';
import type { StaffGuildData, StaffProfile, StaffWarning, StaffNote, StaffTimelineEvent, ShiftSession } from './types';
import { makeDefaultProfile, makeDefaultSettings } from './types';

const DATA_PATH = path.join(process.cwd(), 'data', 'staff.json');
const MAX_TIMELINE = 200;
const MAX_SHIFT_LOG_PER_GUILD = 5000;

interface FileData {
  guilds: Record<string, StaffGuildData>;
}

function makeDefaultGuildData(guildId: string): StaffGuildData {
  return { guildId, settings: makeDefaultSettings(), profiles: {}, shiftLog: [] };
}

async function load(): Promise<FileData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null) {
      return (parsed as unknown) as FileData;
    }
  } catch { /* first run */ }
  return { guilds: {} };
}

async function save(data: FileData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── Guild-level ──────────────────────────────────────────────────────────────

export async function getGuildStaffData(guildId: string): Promise<StaffGuildData> {
  const data = await load();
  return data.guilds[guildId] ?? makeDefaultGuildData(guildId);
}

export async function updateStaffSettings(
  guildId: string,
  patch: Partial<StaffGuildData['settings']>,
): Promise<StaffGuildData> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  guild.settings = { ...guild.settings, ...patch };
  data.guilds[guildId] = guild;
  await save(data);
  return guild;
}

// ── Profiles ───────────────────────────────────────────────────────────────

export async function getProfile(guildId: string, userId: string): Promise<StaffProfile | undefined> {
  const data = await load();
  return data.guilds[guildId]?.profiles[userId];
}

export async function listProfiles(guildId: string): Promise<StaffProfile[]> {
  const data = await load();
  return Object.values(data.guilds[guildId]?.profiles ?? {});
}

/** Mutates a profile via the callback (creating it with defaults if needed) and persists. */
export async function mutateProfile(
  guildId: string,
  userId: string,
  mutator: (profile: StaffProfile) => void,
): Promise<StaffProfile> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  const profile = guild.profiles[userId] ?? makeDefaultProfile(guildId, userId);
  mutator(profile);
  guild.profiles[userId] = profile;
  data.guilds[guildId] = guild;
  await save(data);
  return profile;
}

export async function addTimelineEvent(
  guildId: string,
  userId: string,
  event: Omit<StaffTimelineEvent, 'id'>,
): Promise<StaffProfile> {
  return mutateProfile(guildId, userId, profile => {
    profile.timeline.unshift({ id: genId(), ...event });
    if (profile.timeline.length > MAX_TIMELINE) profile.timeline.length = MAX_TIMELINE;
    profile.lastActivityAt = event.timestamp;
    if (profile.status === 'inactive') profile.status = 'active';
  });
}

export async function addWarning(
  guildId: string,
  userId: string,
  reason: string,
  moderatorId: string,
  moderatorTag: string,
): Promise<{ profile: StaffProfile; warning: StaffWarning }> {
  const warning: StaffWarning = { id: genId(), reason, moderatorId, moderatorTag, timestamp: Date.now() };
  const profile = await mutateProfile(guildId, userId, p => {
    p.warnings.unshift(warning);
    p.timeline.unshift({
      id: genId(),
      action: 'warning_added',
      description: `Received a staff warning from ${moderatorTag}: ${reason}`,
      timestamp: warning.timestamp,
    });
    if (p.timeline.length > MAX_TIMELINE) p.timeline.length = MAX_TIMELINE;
  });
  return { profile, warning };
}

export async function addNote(
  guildId: string,
  userId: string,
  authorId: string,
  authorTag: string,
  content: string,
): Promise<{ profile: StaffProfile; note: StaffNote }> {
  const note: StaffNote = { id: genId(), authorId, authorTag, content, timestamp: Date.now() };
  const profile = await mutateProfile(guildId, userId, p => {
    p.notes.unshift(note);
  });
  return { profile, note };
}

export async function removeNote(guildId: string, userId: string, noteId: string): Promise<boolean> {
  const data = await load();
  const profile = data.guilds[guildId]?.profiles[userId];
  if (!profile) return false;
  const before = profile.notes.length;
  profile.notes = profile.notes.filter(n => n.id !== noteId);
  if (profile.notes.length === before) return false;
  await save(data);
  return true;
}

export async function setStatus(guildId: string, userId: string, status: StaffProfile['status']): Promise<StaffProfile> {
  return mutateProfile(guildId, userId, p => { p.status = status; });
}

// ── Shifts ───────────────────────────────────────────────────────────────────

export async function startShift(guildId: string, userId: string): Promise<{ ok: boolean; profile: StaffProfile }> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  const profile = guild.profiles[userId] ?? makeDefaultProfile(guildId, userId);
  if (profile.currentShiftStartedAt) {
    guild.profiles[userId] = profile;
    data.guilds[guildId] = guild;
    return { ok: false, profile };
  }
  profile.currentShiftStartedAt = Date.now();
  profile.lastActivityAt = profile.currentShiftStartedAt;
  profile.timeline.unshift({ id: genId(), action: 'shift_start', description: 'Started a shift', timestamp: profile.currentShiftStartedAt });
  if (profile.timeline.length > MAX_TIMELINE) profile.timeline.length = MAX_TIMELINE;
  guild.profiles[userId] = profile;
  data.guilds[guildId] = guild;
  await save(data);
  return { ok: true, profile };
}

export async function endShift(guildId: string, userId: string): Promise<{ ok: boolean; profile: StaffProfile; session?: ShiftSession }> {
  const data = await load();
  const guild = data.guilds[guildId] ?? makeDefaultGuildData(guildId);
  const profile = guild.profiles[userId] ?? makeDefaultProfile(guildId, userId);
  if (!profile.currentShiftStartedAt) {
    guild.profiles[userId] = profile;
    data.guilds[guildId] = guild;
    return { ok: false, profile };
  }
  const startedAt = profile.currentShiftStartedAt;
  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - startedAt);
  const session: ShiftSession = { id: genId(), userId, startedAt, endedAt, durationMs };

  profile.currentShiftStartedAt = undefined;
  profile.totalActivityMs += durationMs;
  profile.lastActivityAt = endedAt;
  profile.timeline.unshift({ id: genId(), action: 'shift_end', description: `Ended a shift (${Math.round(durationMs / 60000)}m)`, timestamp: endedAt });
  if (profile.timeline.length > MAX_TIMELINE) profile.timeline.length = MAX_TIMELINE;

  guild.profiles[userId] = profile;
  guild.shiftLog.push(session);
  if (guild.shiftLog.length > MAX_SHIFT_LOG_PER_GUILD) {
    guild.shiftLog = guild.shiftLog.slice(-MAX_SHIFT_LOG_PER_GUILD);
  }
  data.guilds[guildId] = guild;
  await save(data);
  return { ok: true, profile, session };
}

export async function getShiftLog(guildId: string, sinceMs?: number): Promise<ShiftSession[]> {
  const data = await load();
  const log = data.guilds[guildId]?.shiftLog ?? [];
  return sinceMs ? log.filter(s => s.endedAt >= sinceMs) : log;
}

export { genId };
