/**
 * Centralized custom-ID factory for the Support Inbox Control Center (ic:cc:*).
 * All dashboard navigation, conversation management, settings, stats, search,
 * export, broadcast, and cleanup actions live here.
 *
 * Routing map (all start with ic:cc:):
 *   ic:cc:inbox           → Inbox overview panel (ephemeral)
 *   ic:cc:convos          → Conversations list page 0 (ephemeral)
 *   ic:cc:convos:<page>   → Conversations list page N (ephemeral)
 *   ic:cc:select          → StringSelectMenu submit — value = userId
 *   ic:cc:stats           → Statistics panel — today (ephemeral)
 *   ic:cc:stats:w         → Statistics panel — this week (ephemeral)
 *   ic:cc:stats:m         → Statistics panel — this month (ephemeral)
 *   ic:cc:settings        → Settings panel (ephemeral)
 *   ic:cc:search          → Open search modal
 *   ic:cc:search_s        → Search modal submit
 *   ic:cc:broadcast       → Open broadcast modal
 *   ic:cc:broadcast_s     → Broadcast modal submit
 *   ic:cc:announce        → Open announcement modal
 *   ic:cc:announce_s      → Announcement modal submit
 *   ic:cc:staff           → Staff panel (ephemeral)
 *   ic:cc:ai              → AI panel (ephemeral)
 *   ic:cc:export          → Export panel (ephemeral)
 *   ic:cc:export:csv      → Download all conversations as CSV
 *   ic:cc:export:json     → Download all conversations as JSON
 *   ic:cc:export:today    → Download today's conversations as CSV
 *   ic:cc:cleanup         → Cleanup panel (ephemeral)
 *   ic:cc:cleanup:confirm → Confirm cleanup action
 *
 * Conversation management (ic:cc:c:*):
 *   ic:cc:c:<uid>         → Conversation management panel for user <uid>
 *   ic:cc:cr:<uid>        → Reply modal trigger
 *   ic:cc:cr_s:<uid>      → Reply modal submit
 *   ic:cc:ca:<uid>        → Assign modal trigger
 *   ic:cc:ca_s:<uid>      → Assign modal submit
 *   ic:cc:ct:<uid>        → Transfer (reassign) modal trigger
 *   ic:cc:ct_s:<uid>      → Transfer modal submit
 *   ic:cc:cn:<uid>        → Rename thread modal trigger
 *   ic:cc:cn_s:<uid>      → Rename thread modal submit
 *   ic:cc:cl:<uid>        → Close / Reopen toggle
 *   ic:cc:cb:<uid>        → Block user
 *   ic:cc:cub:<uid>       → Unblock user
 *   ic:cc:cdt:<uid>       → Delete thread (action — confirms inline)
 *
 * Settings modals (ic:cc:s:*):
 *   ic:cc:s:ch            → Edit support channel modal trigger
 *   ic:cc:s:ch_s          → Edit support channel submit
 *   ic:cc:s:lc            → Edit log channel modal trigger
 *   ic:cc:s:lc_s          → Edit log channel submit
 *   ic:cc:s:gm            → Edit greeting message modal trigger
 *   ic:cc:s:gm_s          → Edit greeting message submit
 *   ic:cc:s:at            → Toggle auto-thread
 *   ic:cc:s:aa            → Toggle auto-archive
 *   ic:cc:s:ac            → Toggle auto-close
 *   ic:cc:s:ai            → Toggle AI features
 */
export const CC = {
  // Navigation
  INBOX:           'ic:cc:inbox',
  CONVOS:          (page = 0): string => page === 0 ? 'ic:cc:convos' : `ic:cc:convos:${page}`,
  CONVOS_SELECT:   'ic:cc:select',
  STATS_DAY:       'ic:cc:stats',
  STATS_WEEK:      'ic:cc:stats:w',
  STATS_MONTH:     'ic:cc:stats:m',
  SETTINGS:        'ic:cc:settings',
  SEARCH:          'ic:cc:search',
  SEARCH_SUBMIT:   'ic:cc:search_s',
  BROADCAST:       'ic:cc:broadcast',
  BROADCAST_SUBMIT:'ic:cc:broadcast_s',
  ANNOUNCE:        'ic:cc:announce',
  ANNOUNCE_SUBMIT: 'ic:cc:announce_s',
  STAFF:           'ic:cc:staff',
  AI_PANEL:        'ic:cc:ai',
  EXPORT:          'ic:cc:export',
  EXPORT_CSV:      'ic:cc:export:csv',
  EXPORT_JSON:     'ic:cc:export:json',
  EXPORT_TODAY:    'ic:cc:export:today',
  CLEANUP:         'ic:cc:cleanup',
  CLEANUP_CONFIRM: 'ic:cc:cleanup:confirm',

  // Conversation management
  conv:           (uid: string): string => `ic:cc:c:${uid}`,
  convReply:      (uid: string): string => `ic:cc:cr:${uid}`,
  convReplySubmit:(uid: string): string => `ic:cc:cr_s:${uid}`,
  convAssign:     (uid: string): string => `ic:cc:ca:${uid}`,
  convAssignSubmit:(uid: string): string => `ic:cc:ca_s:${uid}`,
  convTransfer:   (uid: string): string => `ic:cc:ct:${uid}`,
  convTransferSubmit:(uid: string): string => `ic:cc:ct_s:${uid}`,
  convRename:     (uid: string): string => `ic:cc:cn:${uid}`,
  convRenameSubmit:(uid: string): string => `ic:cc:cn_s:${uid}`,
  convClose:      (uid: string): string => `ic:cc:cl:${uid}`,
  convBlock:      (uid: string): string => `ic:cc:cb:${uid}`,
  convUnblock:    (uid: string): string => `ic:cc:cub:${uid}`,
  convDeleteThread:(uid: string): string => `ic:cc:cdt:${uid}`,

  // Settings
  SET_CHANNEL:        'ic:cc:s:ch',
  SET_CHANNEL_SUBMIT: 'ic:cc:s:ch_s',
  SET_LOGCHAN:        'ic:cc:s:lc',
  SET_LOGCHAN_SUBMIT: 'ic:cc:s:lc_s',
  SET_GREETING:       'ic:cc:s:gm',
  SET_GREETING_SUBMIT:'ic:cc:s:gm_s',
  SET_AUTOTHREAD:     'ic:cc:s:at',
  SET_AUTOARCHIVE:    'ic:cc:s:aa',
  SET_AUTOCLOSE:      'ic:cc:s:ac',
  SET_AI:             'ic:cc:s:ai',
} as const;

export function isCCInteraction(id: string): boolean {
  return id.startsWith('ic:cc:');
}

/** Parses ic:cc:c:<uid> conversation panel IDs */
export function parseConvPanelId(id: string): string | undefined {
  if (!id.startsWith('ic:cc:c:')) return undefined;
  const uid = id.slice('ic:cc:c:'.length);
  return uid || undefined;
}

/** Parses ic:cc:convos:<page> pagination IDs */
export function parseConvosPage(id: string): number {
  if (id === 'ic:cc:convos') return 0;
  if (id.startsWith('ic:cc:convos:')) return parseInt(id.slice('ic:cc:convos:'.length), 10) || 0;
  return 0;
}
