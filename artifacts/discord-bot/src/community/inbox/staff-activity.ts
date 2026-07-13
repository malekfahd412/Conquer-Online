// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Staff Activity Tracker
//
// Discord's true "online" presence requires the privileged Presence Intent,
// which must also be toggled on in the Discord Developer Portal — enabling it
// blindly risks the entire bot failing to log in if the portal setting isn't
// flipped too. To show a "staff online" style count on the inbox dashboard
// without that risk, we approximate it: any support staff member who sends a
// guild message, replies/notes in an inbox thread, or opens the ephemeral
// Support Inbox panel is marked "active now" for a short rolling window.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface ActiveEntry {
  tag: string;
  lastSeenAt: number;
}

const activeStaff = new Map<string, ActiveEntry>();

/** Marks a staff member as active right now (call on any staff interaction/message). */
export function markStaffActive(userId: string, tag: string): void {
  activeStaff.set(userId, { tag, lastSeenAt: Date.now() });
}

function prune(): void {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  for (const [id, entry] of activeStaff) {
    if (entry.lastSeenAt < cutoff) activeStaff.delete(id);
  }
}

/** Count of staff active within the rolling window. */
export function getActiveStaffCount(): number {
  prune();
  return activeStaff.size;
}

/** Tags of staff active within the rolling window (for tooltips/embeds). */
export function getActiveStaffTags(): string[] {
  prune();
  return [...activeStaff.values()].map(e => e.tag);
}
