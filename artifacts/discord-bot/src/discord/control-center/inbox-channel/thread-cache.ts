// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox — In-Memory Thread Cache
//
// Pure performance layer on top of the existing Support Inbox Pro data model
// (community/inbox/*). Nothing here changes what gets persisted to
// data/inbox.json — it only avoids redundant Discord API calls when resolving
// a user's conversation thread, and de-duplicates concurrent thread creation.
//
//   • userToThread / threadToUser — O(1) lookup maps, hydrated from the
//     existing `threadId` field on each conversation at startup.
//   • pendingCreations — Map<userId, Promise<ThreadChannel>> so that two
//     messages arriving for the same user at nearly the same time only ever
//     trigger one `channel.threads.create()` call; the second caller just
//     awaits the first caller's promise.
//   • Metadata (createdAt / lastActivity / lastMessageId) is cache-only and
//     rebuilt from `InboxConversation` fields — it is never written back to
//     inbox.json, so the on-disk format is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client, ThreadChannel } from 'discord.js';
import type { InboxConversation } from '../../../community/inbox';
import { logger } from '../../../utils/logger';

export interface ThreadCacheEntry {
  userId: string;
  threadId: string;
  guildId: string;
  createdAt: number;
  lastActivity: number;
  lastMessageId?: string;
}

const userToThread = new Map<string, ThreadCacheEntry>();
const threadToUser = new Map<string, string>();
const pendingCreations = new Map<string, Promise<ThreadChannel>>();

/** Populates the cache from persisted conversations at startup — no Discord API calls involved. */
export function hydrateThreadCache(conversations: InboxConversation[]): void {
  let count = 0;
  for (const conv of conversations) {
    if (!conv.threadId) continue;
    const entry: ThreadCacheEntry = {
      userId: conv.userId,
      threadId: conv.threadId,
      guildId: conv.threadGuildId ?? conv.guildId,
      createdAt: conv.createdAt,
      lastActivity: conv.updatedAt ?? conv.lastMessageAt ?? conv.createdAt,
      lastMessageId: conv.messages.length ? conv.messages[conv.messages.length - 1].id : undefined,
    };
    userToThread.set(conv.userId, entry);
    threadToUser.set(conv.threadId, conv.userId);
    count += 1;
  }
  if (count) logger.info(`[SupportInbox] Thread cache hydrated with ${count} conversation(s)`);
}

export function getCachedByUserId(userId: string): ThreadCacheEntry | undefined {
  return userToThread.get(userId);
}

export function getCachedByThreadId(threadId: string): ThreadCacheEntry | undefined {
  const userId = threadToUser.get(threadId);
  return userId ? userToThread.get(userId) : undefined;
}

export function setCached(entry: ThreadCacheEntry): void {
  const previous = userToThread.get(entry.userId);
  if (previous && previous.threadId !== entry.threadId) threadToUser.delete(previous.threadId);
  userToThread.set(entry.userId, entry);
  threadToUser.set(entry.threadId, entry.userId);
}

export function removeCached(userId: string): void {
  const entry = userToThread.get(userId);
  if (!entry) return;
  userToThread.delete(userId);
  threadToUser.delete(entry.threadId);
}

/** Bumps lastActivity/lastMessageId for an already-cached thread (no-op if not cached yet). */
export function touchActivity(userId: string, lastMessageId?: string): void {
  const entry = userToThread.get(userId);
  if (!entry) return;
  entry.lastActivity = Date.now();
  if (lastMessageId) entry.lastMessageId = lastMessageId;
}

/**
 * Ensures only one thread-creation (or resolution) attempt runs at a time per user.
 * A second caller arriving while the first is in flight just awaits the same promise
 * instead of triggering a second `channel.threads.create()`.
 */
export function withPendingCreation(userId: string, factory: () => Promise<ThreadChannel>): Promise<ThreadChannel> {
  const inFlight = pendingCreations.get(userId);
  if (inFlight) return inFlight;

  const promise = factory().finally(() => {
    pendingCreations.delete(userId);
  });
  pendingCreations.set(userId, promise);
  return promise;
}

// ── Performance logging (requirement: log only operations slower than 300ms) ──

export type PerfLabel = 'Thread Lookup' | 'Thread Create' | 'Message Send';

export function logIfSlow(label: PerfLabel, startedAt: number): void {
  const ms = Date.now() - startedAt;
  if (ms > 300) logger.info(`[SupportInbox] ${label}: ${ms}ms`);
}

// ── Automatic cleanup (requirement: sweep every 30 minutes, memory only) ──────

let sweepTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Every 30 minutes, drops cache entries whose thread channel is no longer resolvable.
 * This never touches inbox.json — it only prunes the in-memory maps so a deleted/left
 * thread doesn't linger as a false-positive cache hit. Uses the client's own channel
 * cache first (no API call); only falls back to a single fetch per candidate when the
 * parent guild is unreachable from cache, keeping the sweep itself cheap.
 */
export function startThreadCacheCleanup(client: Client, intervalMs = 30 * 60 * 1000): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = setInterval(() => {
    void sweepStaleEntries(client);
  }, intervalMs);
  sweepTimer.unref?.();
}

async function sweepStaleEntries(client: Client): Promise<void> {
  let removed = 0;
  for (const entry of [...userToThread.values()]) {
    const cached = client.channels.cache.get(entry.threadId);
    if (cached) continue; // still resolvable from cache — keep it

    const guild = client.guilds.cache.get(entry.guildId);
    if (!guild) continue; // can't verify right now; leave it for the next sweep

    const thread = await guild.channels.fetch(entry.threadId).catch(() => null);
    if (!thread) {
      removeCached(entry.userId);
      removed += 1;
    }
  }
  if (removed) logger.info(`[SupportInbox] Thread cache cleanup removed ${removed} stale entr${removed === 1 ? 'y' : 'ies'}`);
}
