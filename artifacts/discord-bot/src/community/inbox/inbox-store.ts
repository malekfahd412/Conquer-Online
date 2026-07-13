// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Persistent JSON Store
// Pattern: same as log-store.ts / welcome-store.ts (queue-serialised writes)
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';
import type {
  InboxData,
  InboxConversation,
  InboxMessage,
  InboxAttachment,
  InboxEmbedSnapshot,
  InboxMessageType,
  InboxSortMode,
  InboxFilterMode,
} from './types';

export type {
  InboxData,
  InboxConversation,
  InboxMessage,
  InboxAttachment,
  InboxEmbedSnapshot,
  InboxMessageType,
  InboxSortMode,
  InboxFilterMode,
};

const DATA_PATH = path.join(process.cwd(), 'data', 'inbox.json');

// ── Write queue: prevents concurrent writes corrupting the JSON ───────────────
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<InboxData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.conversations)) return parsed as unknown as InboxData;
    return { conversations: [] };
  } catch {
    return { conversations: [] };
  }
}

async function save(data: InboxData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function mutate<R>(fn: (data: InboxData) => R): Promise<R> {
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

function findOrCreate(data: InboxData, userId: string, userTag: string, guildId: string): InboxConversation {
  let conv = data.conversations.find(c => c.id === userId);
  if (!conv) {
    const now = Date.now();
    conv = {
      id: userId,
      userId,
      userTag,
      guildId,
      messages: [],
      status: 'open',
      isRead: false,
      isPinned: false,
      isArchived: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      unreadCount: 0,
    };
    data.conversations.push(conv);
  }
  return conv;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAllConversations(): Promise<InboxConversation[]> {
  const data = await load();
  return data.conversations;
}

export async function getConversation(userId: string): Promise<InboxConversation | undefined> {
  const data = await load();
  return data.conversations.find(c => c.id === userId);
}

/** Appends a message from a user's DM to the inbox. */
export async function addUserMessage(
  userId: string,
  userTag: string,
  guildId: string,
  content: string,
  attachments: InboxAttachment[],
  options: {
    msgId: string;
    hasEmbeds?: boolean;
    hasStickers?: boolean;
    replyToId?: string;
    replyToContent?: string;
    isEdited?: boolean;
    embedSnapshots?: InboxEmbedSnapshot[];
  },
): Promise<InboxConversation> {
  return mutate(data => {
    const conv = findOrCreate(data, userId, userTag, guildId);
    conv.userTag = userTag;

    const msg: InboxMessage = {
      id: options.msgId,
      type: 'user',
      content,
      authorId: userId,
      authorTag: userTag,
      timestamp: Date.now(),
      isEdited: options.isEdited ?? false,
      attachments,
      hasEmbeds: options.hasEmbeds ?? false,
      hasStickers: options.hasStickers ?? false,
      replyToId: options.replyToId,
      replyToContent: options.replyToContent,
      embedSnapshots: options.embedSnapshots,
    };

    conv.messages.push(msg);
    conv.isRead = false;
    conv.unreadCount += 1;
    conv.updatedAt = Date.now();
    conv.lastMessageAt = Date.now();
    if (conv.status === 'closed') conv.status = 'open';

    return conv;
  });
}

/** Records a staff reply (message that was already sent to user). */
export async function addStaffReply(
  userId: string,
  staffId: string,
  staffTag: string,
  content: string,
  attachments: InboxAttachment[],
  options: { msgId: string },
): Promise<InboxConversation> {
  return mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (!conv) throw new Error(`Conversation for ${userId} not found`);

    conv.messages.push({
      id: options.msgId,
      type: 'staff_reply',
      content,
      authorId: staffId,
      authorTag: staffTag,
      timestamp: Date.now(),
      isEdited: false,
      attachments,
      hasEmbeds: false,
      hasStickers: false,
    });

    conv.updatedAt = Date.now();
    return conv;
  });
}

/** Adds a private staff note (never sent to user). */
export async function addStaffNote(
  userId: string,
  staffId: string,
  staffTag: string,
  content: string,
): Promise<InboxConversation> {
  return mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (!conv) throw new Error(`Conversation for ${userId} not found`);

    conv.messages.push({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: 'staff_note',
      content,
      authorId: staffId,
      authorTag: staffTag,
      timestamp: Date.now(),
      isEdited: false,
      attachments: [],
      hasEmbeds: false,
      hasStickers: false,
    });

    conv.updatedAt = Date.now();
    return conv;
  });
}

export async function markAsRead(userId: string): Promise<void> {
  await mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (conv) { conv.isRead = true; conv.unreadCount = 0; conv.lastSeenAt = Date.now(); }
  });
}

export async function markAsUnread(userId: string): Promise<void> {
  await mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (conv) { conv.isRead = false; conv.unreadCount = Math.max(conv.unreadCount, 1); }
  });
}

export async function togglePin(userId: string): Promise<boolean> {
  return mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (!conv) return false;
    conv.isPinned = !conv.isPinned;
    conv.updatedAt = Date.now();
    return conv.isPinned;
  });
}

export async function toggleArchive(userId: string): Promise<boolean> {
  return mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (!conv) return false;
    conv.isArchived = !conv.isArchived;
    conv.updatedAt = Date.now();
    return conv.isArchived;
  });
}

export async function setStatus(userId: string, status: 'open' | 'closed'): Promise<void> {
  await mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (conv) { conv.status = status; conv.updatedAt = Date.now(); }
  });
}

export async function assignTo(
  userId: string,
  staffId: string | undefined,
  staffTag: string | undefined,
): Promise<void> {
  await mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (conv) {
      conv.assignedTo    = staffId;
      conv.assignedToTag = staffTag;
      conv.updatedAt     = Date.now();
    }
  });
}

export async function addTag(userId: string, tag: string): Promise<string[]> {
  return mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (!conv) return [];
    const clean = tag.trim().toLowerCase().slice(0, 20);
    if (clean && !conv.tags.includes(clean)) conv.tags.push(clean);
    conv.updatedAt = Date.now();
    return conv.tags;
  });
}

export async function removeTag(userId: string, tag: string): Promise<string[]> {
  return mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (!conv) return [];
    conv.tags = conv.tags.filter(t => t !== tag);
    conv.updatedAt = Date.now();
    return conv.tags;
  });
}

export async function updateUserAvatar(userId: string, avatar: string): Promise<void> {
  await mutate(data => {
    const conv = data.conversations.find(c => c.id === userId);
    if (conv) conv.userAvatar = avatar;
  });
}

// ── Querying Helpers ──────────────────────────────────────────────────────────

export function sortConversations(
  convs: InboxConversation[],
  sort: InboxSortMode,
): InboxConversation[] {
  const arr = [...convs];
  if (sort === 'newest')  arr.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  if (sort === 'oldest')  arr.sort((a, b) => a.lastMessageAt - b.lastMessageAt);
  if (sort === 'unread')  arr.sort((a, b) => b.unreadCount - a.unreadCount || b.lastMessageAt - a.lastMessageAt);
  arr.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  return arr;
}

export function filterConversations(
  convs: InboxConversation[],
  filter: InboxFilterMode,
): InboxConversation[] {
  switch (filter) {
    case 'unread':   return convs.filter(c => !c.isRead && !c.isArchived);
    case 'pinned':   return convs.filter(c => c.isPinned);
    case 'archived': return convs.filter(c => c.isArchived);
    default:         return convs.filter(c => !c.isArchived);
  }
}

export function searchConversations(
  convs: InboxConversation[],
  query: string,
): InboxConversation[] {
  const q = query.toLowerCase().trim();
  if (!q) return convs;
  return convs.filter(
    c =>
      c.userTag.toLowerCase().includes(q) ||
      c.userId.includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q)),
  );
}

export function getTotalUnread(convs: InboxConversation[]): number {
  return convs.filter(c => !c.isArchived && !c.isRead).length;
}
