/**
 * Centralized custom-ID factory for the Discord-Native Support Inbox channel
 * interface (thread controls + dashboard). ALL ic:* custom IDs must be
 * generated here — separate namespace from the ephemeral `si:*` Support Inbox
 * Pro panel (still fully intact and reachable via /panel).
 *
 * Routing rules:
 *   ic:dash:refresh          → manually refresh the dashboard embed
 *   ic:reply:<uid>           → show reply modal (thread control button)
 *   ic:reply_s:<uid>         → reply modal submit
 *   ic:note:<uid>            → show internal note modal (thread control button)
 *   ic:note_s:<uid>          → note modal submit
 *   ic:ai:<uid>              → AI Assist — suggest a reply, posted in-thread
 *   ic:voice:<uid>           → Voice Support — create a temp staff+user voice channel
 *   ic:summary:<uid>         → AI Summary — summarize the conversation, posted in-thread
 *   ic:close:<uid>           → close conversation + archive & lock thread
 *   ic:reopen:<uid>          → reopen conversation + unarchive thread
 */
export const IC = {
  DASH_REFRESH: 'ic:dash:refresh',

  reply:       (uid: string): string => `ic:reply:${uid}`,
  replySubmit: (uid: string): string => `ic:reply_s:${uid}`,
  note:        (uid: string): string => `ic:note:${uid}`,
  noteSubmit:  (uid: string): string => `ic:note_s:${uid}`,
  ai:          (uid: string): string => `ic:ai:${uid}`,
  voice:       (uid: string): string => `ic:voice:${uid}`,
  summary:     (uid: string): string => `ic:summary:${uid}`,
  close:       (uid: string): string => `ic:close:${uid}`,
  reopen:      (uid: string): string => `ic:reopen:${uid}`,
} as const;

export function isICInteraction(id: string): boolean {
  return id.startsWith('ic:');
}
