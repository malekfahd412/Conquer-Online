// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Quick Replies Persistent JSON Store
// Pattern: same as inbox-store.ts (queue-serialised writes)
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';
import type { QuickReply, QuickReplyData } from './types';

export type { QuickReply, QuickReplyData };

const DATA_PATH = path.join(process.cwd(), 'data', 'quick-replies.json');

// ── Write queue: prevents concurrent writes corrupting the JSON ───────────────
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<QuickReplyData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.replies)) return parsed as unknown as QuickReplyData;
    return { replies: [] };
  } catch {
    return { replies: [] };
  }
}

async function save(data: QuickReplyData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function mutate<R>(fn: (data: QuickReplyData) => R): Promise<R> {
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

function genId(): string {
  return `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAllQuickReplies(): Promise<QuickReply[]> {
  const data = await load();
  return [...data.replies].sort((a, b) => a.title.localeCompare(b.title));
}

export async function getQuickReply(id: string): Promise<QuickReply | undefined> {
  const data = await load();
  return data.replies.find(r => r.id === id);
}

export async function addQuickReply(title: string, content: string): Promise<QuickReply> {
  return mutate(data => {
    const now = Date.now();
    const reply: QuickReply = { id: genId(), title: title.trim().slice(0, 80), content: content.trim(), createdAt: now, updatedAt: now };
    data.replies.push(reply);
    return reply;
  });
}

export async function updateQuickReply(id: string, title: string, content: string): Promise<QuickReply | undefined> {
  return mutate(data => {
    const reply = data.replies.find(r => r.id === id);
    if (!reply) return undefined;
    reply.title = title.trim().slice(0, 80);
    reply.content = content.trim();
    reply.updatedAt = Date.now();
    return reply;
  });
}

export async function deleteQuickReply(id: string): Promise<boolean> {
  return mutate(data => {
    const before = data.replies.length;
    data.replies = data.replies.filter(r => r.id !== id);
    return data.replies.length < before;
  });
}

/** Resolves {user}, {server}, {ticket}, {staff} placeholders in a quick reply's content. */
export function resolvePlaceholders(
  content: string,
  ctx: { user: string; server: string; ticket: string; staff: string },
): string {
  return content
    .replaceAll('{user}', ctx.user)
    .replaceAll('{server}', ctx.server)
    .replaceAll('{ticket}', ctx.ticket)
    .replaceAll('{staff}', ctx.staff);
}
