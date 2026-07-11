import { promises as fs } from 'fs';
import path from 'path';

export type VerificationMethod = 'button' | 'rules' | 'math' | 'word' | 'emoji' | 'manual';

export interface VerificationPanelConfig {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  title: string;
  description: string;
  color: number;
  method: VerificationMethod;
  verifiedRoleId: string;
  unverifiedRoleId?: string;
  welcomeRoleId?: string;
  logChannelId?: string;
  autoRemoveUnverifiedMinutes?: number;
  minAccountAgeDays: number;
  cooldownSeconds: number;
  createdAt: number;
}

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface VerificationAttempt {
  id: string;
  guildId: string;
  panelId: string;
  userId: string;
  status: VerificationStatus;
  method: VerificationMethod;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  lastAttemptAt: number;
  failCount: number;
}

interface VerificationData {
  panels: VerificationPanelConfig[];
  attempts: VerificationAttempt[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'verification.json');

async function load(): Promise<VerificationData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as VerificationData;
  } catch {
    return { panels: [], attempts: [] };
  }
}

async function save(data: VerificationData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function createVerificationPanel(cfg: Omit<VerificationPanelConfig, 'id' | 'createdAt'>): Promise<VerificationPanelConfig> {
  const data = await load();
  const panel: VerificationPanelConfig = { ...cfg, id: genId('vpanel'), createdAt: Date.now() };
  data.panels.push(panel);
  await save(data);
  return panel;
}

export async function updateVerificationPanelMessage(panelId: string, messageId: string): Promise<void> {
  const data = await load();
  const panel = data.panels.find(p => p.id === panelId);
  if (panel) { panel.messageId = messageId; await save(data); }
}

export async function getVerificationPanels(guildId: string): Promise<VerificationPanelConfig[]> {
  const data = await load();
  return data.panels.filter(p => p.guildId === guildId);
}

export async function getVerificationPanel(panelId: string): Promise<VerificationPanelConfig | undefined> {
  const data = await load();
  return data.panels.find(p => p.id === panelId);
}

export async function deleteVerificationPanel(panelId: string): Promise<boolean> {
  const data = await load();
  const before = data.panels.length;
  data.panels = data.panels.filter(p => p.id !== panelId);
  await save(data);
  return data.panels.length < before;
}

export async function updateVerificationPanelConfig(panelId: string, patch: Partial<VerificationPanelConfig>): Promise<VerificationPanelConfig | undefined> {
  const data = await load();
  const panel = data.panels.find(p => p.id === panelId);
  if (!panel) return undefined;
  Object.assign(panel, patch);
  await save(data);
  return panel;
}

export async function getAttempt(guildId: string, panelId: string, userId: string): Promise<VerificationAttempt | undefined> {
  const data = await load();
  return data.attempts.find(a => a.guildId === guildId && a.panelId === panelId && a.userId === userId);
}

export async function upsertAttempt(a: Omit<VerificationAttempt, 'id' | 'createdAt' | 'lastAttemptAt' | 'failCount'> & Partial<Pick<VerificationAttempt, 'failCount'>>): Promise<VerificationAttempt> {
  const data = await load();
  let existing = data.attempts.find(x => x.guildId === a.guildId && x.panelId === a.panelId && x.userId === a.userId);
  const now = Date.now();
  if (existing) {
    existing.status = a.status;
    existing.lastAttemptAt = now;
    existing.resolvedAt = a.status !== 'pending' ? now : existing.resolvedAt;
    existing.resolvedBy = a.resolvedBy ?? existing.resolvedBy;
    if (a.failCount !== undefined) existing.failCount = a.failCount;
    await save(data);
    return existing;
  }
  existing = { ...a, id: genId('vattempt'), createdAt: now, lastAttemptAt: now, failCount: a.failCount ?? 0 };
  data.attempts.push(existing);
  await save(data);
  return existing;
}

export async function incrementFail(attemptId: string): Promise<number> {
  const data = await load();
  const attempt = data.attempts.find(a => a.id === attemptId);
  if (!attempt) return 0;
  attempt.failCount += 1;
  attempt.lastAttemptAt = Date.now();
  await save(data);
  return attempt.failCount;
}

export async function getAttempts(guildId: string, status?: VerificationStatus): Promise<VerificationAttempt[]> {
  const data = await load();
  return data.attempts.filter(a => a.guildId === guildId && (!status || a.status === status));
}

/**
 * Removes all verification attempts for a user in a guild (across all panels).
 * Called when a member leaves the server, so that if they rejoin later they
 * are treated as unverified again instead of being blocked by a stale
 * "already verified" record.
 */
export async function clearAttemptsForUser(guildId: string, userId: string): Promise<number> {
  const data = await load();
  const before = data.attempts.length;
  data.attempts = data.attempts.filter(a => !(a.guildId === guildId && a.userId === userId));
  await save(data);
  return before - data.attempts.length;
}
