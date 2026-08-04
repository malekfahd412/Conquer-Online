// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox — Persistent Settings Store
// Per-guild settings for the Control Center, editable through the UI.
// Same queue-serialised pattern as other *-store.ts files in this project.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';

export interface InboxSettings {
  guildId: string;
  /** Override channel ID (if not set, the auto-created channel is used) */
  supportChannelId?: string;
  /** Optional channel for logging staff actions */
  logChannelId?: string;
  /** Staff role IDs that can access the inbox */
  staffRoleIds: string[];
  /** Category ID for new threads (if not set, uses parent channel's category) */
  threadCategoryId?: string;
  /** Auto-sent greeting when a new conversation is created */
  greetingMessage: string;
  /** Whether to automatically create a thread for every new DM conversation */
  autoThread: boolean;
  /** Days after which inactive threads are auto-archived (0 = disabled) */
  autoArchiveDays: number;
  /** Days after which closed conversations are auto-archived (0 = disabled) */
  autoCloseDays: number;
  /** Whether AI features (suggest/rewrite/translate/summarize) are enabled */
  aiEnabled: boolean;
}

const DATA_PATH = path.join(process.cwd(), 'data', 'inbox-settings.json');
let writeQueue: Promise<void> = Promise.resolve();

function defaultSettings(guildId: string): InboxSettings {
  return {
    guildId,
    staffRoleIds: [],
    greetingMessage: 'Hello! A staff member will be with you shortly. Please describe your issue and we\'ll get back to you as soon as possible.',
    autoThread: true,
    autoArchiveDays: 7,
    autoCloseDays: 0,
    aiEnabled: true,
  };
}

async function load(): Promise<Record<string, InboxSettings>> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, InboxSettings>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function save(data: Record<string, InboxSettings>): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function mutate<R>(fn: (data: Record<string, InboxSettings>) => R): Promise<R> {
  const run = async (): Promise<R> => {
    const data = await load();
    const result = fn(data);
    await save(data);
    return result;
  };
  const p = writeQueue.then(run, run);
  writeQueue = p.then(() => undefined, () => undefined);
  return p;
}

export async function getInboxSettings(guildId: string): Promise<InboxSettings> {
  const data = await load();
  return { ...defaultSettings(guildId), ...(data[guildId] ?? {}) };
}

export async function updateInboxSettings(
  guildId: string,
  patch: Partial<Omit<InboxSettings, 'guildId'>>,
): Promise<InboxSettings> {
  return mutate(data => {
    const existing = { ...defaultSettings(guildId), ...(data[guildId] ?? {}) };
    data[guildId] = { ...existing, ...patch };
    return data[guildId];
  });
}
