import { promises as fs } from 'fs';
import path from 'path';

export interface Warning {
  id: string;
  userId: string;
  guildId: string;
  reason: string;
  moderatorId: string;
  timestamp: number;
}

export interface ModNote {
  id: string;
  userId: string;
  guildId: string;
  content: string;
  moderatorId: string;
  timestamp: number;
}

interface ModerationData {
  warnings: Warning[];
  notes: ModNote[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'moderation.json');

async function load(): Promise<ModerationData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as ModerationData;
  } catch {
    return { warnings: [], notes: [] };
  }
}

async function save(data: ModerationData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function addWarning(w: Omit<Warning, 'id' | 'timestamp'>): Promise<Warning> {
  const data = await load();
  const entry: Warning = { ...w, id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
  data.warnings.push(entry);
  await save(data);
  return entry;
}

export async function removeWarning(guildId: string, warningId: string): Promise<boolean> {
  const data = await load();
  const before = data.warnings.length;
  data.warnings = data.warnings.filter(w => !(w.guildId === guildId && w.id === warningId));
  await save(data);
  return data.warnings.length < before;
}

export async function getWarnings(guildId: string, userId?: string): Promise<Warning[]> {
  const data = await load();
  return data.warnings.filter(w => w.guildId === guildId && (!userId || w.userId === userId));
}

export async function addNote(n: Omit<ModNote, 'id' | 'timestamp'>): Promise<ModNote> {
  const data = await load();
  const entry: ModNote = { ...n, id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
  data.notes.push(entry);
  await save(data);
  return entry;
}

export async function removeNote(guildId: string, noteId: string): Promise<boolean> {
  const data = await load();
  const before = data.notes.length;
  data.notes = data.notes.filter(n => !(n.guildId === guildId && n.id === noteId));
  await save(data);
  return data.notes.length < before;
}

export async function getNotes(guildId: string, userId?: string): Promise<ModNote[]> {
  const data = await load();
  return data.notes.filter(n => n.guildId === guildId && (!userId || n.userId === userId));
}
