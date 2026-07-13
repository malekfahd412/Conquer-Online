// ─────────────────────────────────────────────────────────────────────────────
// Discord-Native Support Inbox — Dashboard Channel Pointer Store
//
// Remembers which channel/message is the live "Active Conversations" dashboard
// so it survives restarts without needing an env var. If `CHANNEL_SUPPORT_INBOX`
// is set it is used as an override the first time; after that the auto-created
// (or configured) channel is remembered here, same pattern as other *-store.ts
// files in this project (queue-serialised writes to a small JSON file).
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';

export interface InboxChannelData {
  guildId: string;
  channelId: string;
  dashboardMessageId?: string;
}

const DATA_PATH = path.join(process.cwd(), 'data', 'inbox-channel.json');

let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, InboxChannelData>> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, InboxChannelData>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function save(data: Record<string, InboxChannelData>): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function mutate<R>(fn: (data: Record<string, InboxChannelData>) => R): Promise<R> {
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

export async function getInboxChannelData(guildId: string): Promise<InboxChannelData | undefined> {
  const data = await load();
  return data[guildId];
}

export async function setInboxChannel(guildId: string, channelId: string): Promise<void> {
  await mutate(data => {
    data[guildId] = { ...(data[guildId] ?? { guildId, channelId }), guildId, channelId };
  });
}

export async function setDashboardMessageId(guildId: string, messageId: string): Promise<void> {
  await mutate(data => {
    const entry = data[guildId];
    if (entry) entry.dashboardMessageId = messageId;
  });
}
