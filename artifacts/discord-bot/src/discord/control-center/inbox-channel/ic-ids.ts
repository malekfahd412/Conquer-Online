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
 *   ic:voice:<uid>           → Voice Support — create a temp staff+user voice channel
 *   ic:close:<uid>           → close conversation + archive & lock thread
 *   ic:reopen:<uid>          → reopen conversation + unarchive thread
 *
 * AI Sidebar (pinned per-thread toolkit — ✨ Suggest / Rewrite / Translate / Summarize / Sentiment / Follow-up):
 *   ic:ai:sug:<uid>          → Suggest Reply — posted in-thread
 *   ic:ai:rw:<uid>           → Rewrite — shows a modal for the draft text to polish
 *   ic:ai:rw_s:<uid>         → Rewrite modal submit
 *   ic:ai:tr:<uid>           → Translate — shows a modal for text + target language
 *   ic:ai:tr_s:<uid>         → Translate modal submit
 *   ic:ai:sum:<uid>          → Summarize — posted in-thread
 *   ic:ai:sent:<uid>         → Detect Sentiment — posted in-thread
 *   ic:ai:fu:<uid>           → Generate Follow-up — posted in-thread
 *
 * Per-message actions (⭐ Pin / 📝 Edit / 🗑 Delete / ↩ Reply / 📋 Copy ID / 🤖 AI Rewrite),
 * encoded as `ic:m:<action>:<uid>:<messageId>` where messageId is the DM message ID for staff
 * replies or the mirrored embed's thread message ID for inbound user messages:
 *   ic:m:pin:<uid>:<msgId>       → toggle pin (Discord-pins the underlying message too)
 *   ic:m:edit:<uid>:<msgId>      → show edit modal (staff replies only)
 *   ic:m:edit_s:<uid>:<msgId>    → edit modal submit
 *   ic:m:del:<uid>:<msgId>       → delete the DM message (staff replies only)
 *   ic:m:reply:<uid>:<msgId>     → show reply modal, quoting this message
 *   ic:m:copy:<uid>:<msgId>      → ephemeral: message ID in a code block to copy
 *   ic:m:rw:<uid>:<msgId>        → AI-rewrite this staff reply (ephemeral preview + Apply button)
 *   ic:m:rwa:<uid>:<msgId>       → apply an AI rewrite preview (edits the DM message)
 */
export const IC = {
  DASH_REFRESH: 'ic:dash:refresh',

  reply:       (uid: string): string => `ic:reply:${uid}`,
  replySubmit: (uid: string): string => `ic:reply_s:${uid}`,
  note:        (uid: string): string => `ic:note:${uid}`,
  noteSubmit:  (uid: string): string => `ic:note_s:${uid}`,
  voice:       (uid: string): string => `ic:voice:${uid}`,
  close:       (uid: string): string => `ic:close:${uid}`,
  reopen:      (uid: string): string => `ic:reopen:${uid}`,

  aiSuggest:         (uid: string): string => `ic:ai:sug:${uid}`,
  aiRewrite:         (uid: string): string => `ic:ai:rw:${uid}`,
  aiRewriteSubmit:   (uid: string): string => `ic:ai:rw_s:${uid}`,
  aiTranslate:       (uid: string): string => `ic:ai:tr:${uid}`,
  aiTranslateSubmit: (uid: string): string => `ic:ai:tr_s:${uid}`,
  aiSummary:         (uid: string): string => `ic:ai:sum:${uid}`,
  aiSentiment:       (uid: string): string => `ic:ai:sent:${uid}`,
  aiFollowup:        (uid: string): string => `ic:ai:fu:${uid}`,

  msgPin:          (uid: string, msgId: string): string => `ic:m:pin:${uid}:${msgId}`,
  msgEdit:         (uid: string, msgId: string): string => `ic:m:edit:${uid}:${msgId}`,
  msgEditSubmit:   (uid: string, msgId: string): string => `ic:m:edit_s:${uid}:${msgId}`,
  msgDelete:       (uid: string, msgId: string): string => `ic:m:del:${uid}:${msgId}`,
  msgReply:        (uid: string, msgId: string): string => `ic:m:reply:${uid}:${msgId}`,
  msgCopyId:       (uid: string, msgId: string): string => `ic:m:copy:${uid}:${msgId}`,
  msgRewrite:      (uid: string, msgId: string): string => `ic:m:rw:${uid}:${msgId}`,
  msgRewriteApply: (uid: string, msgId: string): string => `ic:m:rwa:${uid}:${msgId}`,
} as const;

/** Parses `ic:m:<action>:<uid>:<msgId>` custom IDs used by per-message action rows. */
export function parseMsgActionId(id: string): { action: string; uid: string; msgId: string } | undefined {
  if (!id.startsWith('ic:m:')) return undefined;
  const rest = id.slice('ic:m:'.length);
  const parts = rest.split(':');
  if (parts.length < 3) return undefined;
  const [action, uid, ...msgParts] = parts;
  return { action, uid, msgId: msgParts.join(':') };
}

export function isICInteraction(id: string): boolean {
  return id.startsWith('ic:');
}
