/**
 * Centralized custom-ID factory for the Support Inbox Pro.
 * ALL si:* custom IDs must be generated here.
 *
 * Routing rules:
 *   si:home                      → inbox list (page 0, newest, all)
 *   si:list:<sort>:<filter>:<pg> → inbox list (paginated, sorted, filtered)
 *   si:search                    → show search modal
 *   si:search_s                  → search modal submit ID
 *   si:view:<uid>:<pg>           → conversation view (page N)
 *   si:reply:<uid>               → show reply modal
 *   si:reply_s:<uid>             → reply modal submit
 *   si:note:<uid>                → show note modal
 *   si:note_s:<uid>              → note modal submit
 *   si:tag:<uid>                 → show tag modal
 *   si:tag_s:<uid>               → tag modal submit
 *   si:pin:<uid>                 → toggle pin
 *   si:archive:<uid>             → toggle archive
 *   si:read:<uid>                → mark as read
 *   si:close:<uid>               → close conversation
 *   si:reopen:<uid>              → reopen conversation
 *   si:assign:<uid>              → assign to self / unassign
 *   si:ai:sug:<uid>              → AI suggest reply
 *   si:ai:sum:<uid>              → AI summarize
 *   si:ai:tr:<uid>               → AI translate last message
 *   si:ai:rw:<uid>               → show AI rewrite modal
 *   si:ai:rw_s:<uid>             → AI rewrite modal submit
 */
export const SI = {
  HOME: 'si:home',
  SEARCH: 'si:search',
  SEARCH_SUBMIT: 'si:search_s',

  list: (sort: string, filter: string, page: number): string =>
    `si:list:${sort}:${filter}:${page}`,

  view: (uid: string, page: number): string => `si:view:${uid}:${page}`,

  reply:        (uid: string): string => `si:reply:${uid}`,
  replySubmit:  (uid: string): string => `si:reply_s:${uid}`,
  note:         (uid: string): string => `si:note:${uid}`,
  noteSubmit:   (uid: string): string => `si:note_s:${uid}`,
  tag:          (uid: string): string => `si:tag:${uid}`,
  tagSubmit:    (uid: string): string => `si:tag_s:${uid}`,

  pin:      (uid: string): string => `si:pin:${uid}`,
  archive:  (uid: string): string => `si:archive:${uid}`,
  read:     (uid: string): string => `si:read:${uid}`,
  close:    (uid: string): string => `si:close:${uid}`,
  reopen:   (uid: string): string => `si:reopen:${uid}`,
  assign:   (uid: string): string => `si:assign:${uid}`,

  aiSuggest:     (uid: string): string => `si:ai:sug:${uid}`,
  aiSummarize:   (uid: string): string => `si:ai:sum:${uid}`,
  aiTranslate:   (uid: string): string => `si:ai:tr:${uid}`,
  aiRewrite:     (uid: string): string => `si:ai:rw:${uid}`,
  aiRewriteSubmit: (uid: string): string => `si:ai:rw_s:${uid}`,

  /** Open the "DM any user by ID" composer modal */
  DM_OPEN:   'si:dm',
  DM_SUBMIT: 'si:dm_s',
} as const;

export function isSIInteraction(id: string): boolean {
  return id.startsWith('si:');
}
