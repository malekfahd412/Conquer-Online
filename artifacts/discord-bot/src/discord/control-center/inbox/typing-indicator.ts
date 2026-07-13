// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Typing Indicator
//
// Discord does not expose keystroke-level events for modal text inputs, so
// there is no way to know exactly when a staff member is "typing" inside the
// Reply modal. This is approximated as: start sending `typing` to the user's
// DM channel the moment the Reply modal is opened, keep it alive every few
// seconds (Discord's typing indicator lasts ~10s per call), and stop the
// instant the reply is actually sent — or after a safety timeout if the
// staff member abandons/cancels the modal without submitting.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from 'discord.js';
import { logger } from '../../../utils/logger';

const RETRIGGER_MS = 8_000;
/** Auto-stop if the modal is never submitted (staff cancelled or walked away). */
const SAFETY_TIMEOUT_MS = 3 * 60_000;

interface TypingSession {
  interval: ReturnType<typeof setInterval>;
  safety: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, TypingSession>();

async function sendTyping(client: Client, uid: string): Promise<void> {
  try {
    const user = await client.users.fetch(uid);
    const dm = await user.createDM();
    await dm.sendTyping();
  } catch (err) {
    logger.warning(`[Inbox] Could not send typing indicator to ${uid}`, err);
  }
}

/** Starts (or extends) the typing indicator for a conversation. Safe to call repeatedly. */
export function startTyping(client: Client, uid: string): void {
  const existing = sessions.get(uid);
  if (existing) {
    clearTimeout(existing.safety);
    existing.safety = setTimeout(() => stopTyping(uid), SAFETY_TIMEOUT_MS);
    return;
  }

  void sendTyping(client, uid);
  const interval = setInterval(() => void sendTyping(client, uid), RETRIGGER_MS);
  const safety = setTimeout(() => stopTyping(uid), SAFETY_TIMEOUT_MS);
  sessions.set(uid, { interval, safety });
}

/** Stops the typing indicator immediately. Safe to call even if none is active. */
export function stopTyping(uid: string): void {
  const existing = sessions.get(uid);
  if (!existing) return;
  clearInterval(existing.interval);
  clearTimeout(existing.safety);
  sessions.delete(uid);
}
