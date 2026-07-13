// ─────────────────────────────────────────────────────────────────────────────
// Discord-Native Support Inbox — Per-Conversation Presence Tracker
//
// Discord gives bots no "user has this thread open" or keystroke-level typing
// event beyond the coarse `typingStart` gateway event, so — same tradeoff as
// staff-activity.ts's server-wide "active now" approximation — presence here
// is a short rolling-window proxy, not literal ground truth:
//   • "Typing"  — a support-staff member fired `typingStart` in this specific
//     conversation thread within the last ~10s (Discord's own client re-fires
//     typingStart roughly every ~8s while the user keeps typing, and simply
//     stops firing once they stop or send — nothing to manually "stop" here).
//   • "Viewing" — a support-staff member pressed a thread-control/message
//     action button for this conversation within the last ~2 minutes. There is
//     no Discord event for "opened a thread", so button/message activity is
//     the closest honest proxy.
// Also used to soft-warn staff about likely duplicate replies: if two
// different staff members are both flagged "typing" in the same conversation,
// the second one to actually send is told so (never blocked — Discord gives
// bots no way to intercept a message before it's sent).
// ─────────────────────────────────────────────────────────────────────────────

const TYPING_WINDOW_MS = 10 * 1000;
const VIEWING_WINDOW_MS = 2 * 60 * 1000;

interface PresenceEntry {
  tag: string;
  at: number;
}

const typingByConv = new Map<string, Map<string, PresenceEntry>>();
const viewingByConv = new Map<string, Map<string, PresenceEntry>>();

function prune(map: Map<string, PresenceEntry>, windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  for (const [id, entry] of map) {
    if (entry.at < cutoff) map.delete(id);
  }
}

export function markTyping(convId: string, userId: string, tag: string): void {
  if (!typingByConv.has(convId)) typingByConv.set(convId, new Map());
  typingByConv.get(convId)!.set(userId, { tag, at: Date.now() });
}

export function markViewing(convId: string, userId: string, tag: string): void {
  if (!viewingByConv.has(convId)) viewingByConv.set(convId, new Map());
  viewingByConv.get(convId)!.set(userId, { tag, at: Date.now() });
}

/** Other staff (excluding `excludeUserId`) currently flagged typing in this conversation. */
export function getOtherTypers(convId: string, excludeUserId: string): string[] {
  const map = typingByConv.get(convId);
  if (!map) return [];
  prune(map, TYPING_WINDOW_MS);
  return [...map.entries()].filter(([id]) => id !== excludeUserId).map(([, e]) => e.tag);
}

/** Renders the "Ahmed is viewing… / Omar is typing…" presence line for the top of the thread control panel. Empty string if nobody is active. */
export function getPresenceLine(convId: string): string {
  const typingMap = typingByConv.get(convId);
  const viewingMap = viewingByConv.get(convId);
  if (typingMap) prune(typingMap, TYPING_WINDOW_MS);
  if (viewingMap) prune(viewingMap, VIEWING_WINDOW_MS);

  const typingTags = new Set([...(typingMap?.values() ?? [])].map(e => e.tag));
  const viewingTags = [...(viewingMap?.values() ?? [])].map(e => e.tag).filter(tag => !typingTags.has(tag));

  const parts: string[] = [];
  for (const tag of typingTags) parts.push(`✍️ **${tag}** is typing…`);
  for (const tag of viewingTags) parts.push(`👁️ **${tag}** is viewing…`);
  return parts.join('  ·  ');
}
