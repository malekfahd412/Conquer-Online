import { promises as fs } from 'fs';
import path from 'path';
import type { Client } from 'discord.js';

export interface ScheduledMessage {
  id: string;
  guildId: string;
  channelId: string;
  content: string;
  sendAt: number;
}

const DATA_PATH = path.join(process.cwd(), 'data', 'scheduled-messages.json');
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function load(): Promise<ScheduledMessage[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as ScheduledMessage[];
  } catch {
    return [];
  }
}

async function persist(msgs: ScheduledMessage[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(msgs, null, 2), 'utf-8');
}

export async function scheduleMessage(sm: Omit<ScheduledMessage, 'id'>, client?: Client): Promise<ScheduledMessage> {
  const all = await load();
  const entry: ScheduledMessage = { ...sm, id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  all.push(entry);
  await persist(all);
  armTimer(entry, client);
  return entry;
}

export async function cancelScheduled(guildId: string, id: string): Promise<boolean> {
  const all = await load();
  const before = all.length;
  const updated = all.filter(m => !(m.guildId === guildId && m.id === id));
  await persist(updated);
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  return updated.length < before;
}

export async function listScheduled(guildId: string): Promise<ScheduledMessage[]> {
  const all = await load();
  return all.filter(m => m.guildId === guildId);
}

function armTimer(sm: ScheduledMessage, client?: Client): void {
  if (!client) return;
  const delay = sm.sendAt - Date.now();
  if (delay < 0) return;
  const t = setTimeout(async () => {
    timers.delete(sm.id);
    try {
      const ch = await client.channels.fetch(sm.channelId);
      if (ch && ch.isTextBased() && 'send' in ch) {
        await (ch as { send(c: string): Promise<unknown> }).send(sm.content);
      }
    } catch { /* ignore */ }
    const all = await load();
    await persist(all.filter(m => m.id !== sm.id));
  }, delay);
  timers.set(sm.id, t);
}

export async function rehydrateScheduled(client: Client): Promise<void> {
  const all = await load();
  const now = Date.now();
  for (const sm of all) {
    if (sm.sendAt > now) armTimer(sm, client);
  }
}
