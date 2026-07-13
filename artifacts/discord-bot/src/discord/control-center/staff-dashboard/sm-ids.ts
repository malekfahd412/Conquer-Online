/**
 * Custom-ID factory for the Staff Management dashboard (sm:* prefix).
 *
 * Routing map (see sm-service.ts):
 *   sm:dash                     → Overview page
 *   sm:stafflist                → Staff List page (string select of tracked staff)
 *   sm:staffsel                 → staff list select menu submit → Performance page
 *   sm:perf:<userId>            → Performance page for one staff member
 *   sm:goals                    → Goals page
 *   sm:goaladd                  → show "add goal" modal
 *   sm:goaladd:m                → add-goal modal submit
 *   sm:goaldel                  → goal-to-delete select menu
 *   sm:lb:<period>              → Leaderboard page for a period
 *   sm:reports                  → Reports page
 *   sm:rep:toggle:<daily|weekly|monthly> → toggle a report schedule
 *   sm:rep:setchannel           → show channel select for report posting
 *   sm:rep:channelsel           → channel select menu submit
 *   sm:warn:<userId>            → Warnings page for one staff member
 *   sm:warnadd:<userId>         → show "add warning" modal
 *   sm:warnadd:m:<userId>       → add-warning modal submit
 *   sm:noteadd:<userId>         → show "add private note" modal
 *   sm:noteadd:m:<userId>       → add-note modal submit
 *   sm:notes:<userId>           → Notes page for one staff member
 *   sm:settings                 → Settings page
 *   sm:set:roles                → tracked-role select menu
 *   sm:set:roles:select         → role select menu submit
 *   sm:set:inactive             → show "inactive threshold" modal
 *   sm:set:inactive:m           → inactive threshold modal submit
 *   sm:points                   → Point Values page
 *   sm:points:select            → action-to-edit select menu
 *   sm:points:m:<action>        → point value modal submit
 */

export const SM = {
  DASH:             'sm:dash',
  STAFFLIST:        'sm:stafflist',
  STAFF_SELECT:     'sm:staffsel',
  perf:             (userId: string): string => `sm:perf:${userId}`,

  GOALS:            'sm:goals',
  GOAL_ADD:         'sm:goaladd',
  GOAL_ADD_M:       'sm:goaladd:m',
  GOAL_DELETE_SEL:  'sm:goaldel',

  leaderboard:      (period: string): string => `sm:lb:${period}`,

  REPORTS:              'sm:reports',
  reportToggle:         (period: 'daily' | 'weekly' | 'monthly'): string => `sm:rep:toggle:${period}`,
  REPORTS_SET_CHANNEL:  'sm:rep:setchannel',
  REPORTS_CHANNEL_SEL:  'sm:rep:channelsel',

  warnings:         (userId: string): string => `sm:warn:${userId}`,
  warnAdd:          (userId: string): string => `sm:warnadd:${userId}`,
  warnAddModal:     (userId: string): string => `sm:warnadd:m:${userId}`,
  notes:            (userId: string): string => `sm:notes:${userId}`,
  noteAdd:          (userId: string): string => `sm:noteadd:${userId}`,
  noteAddModal:     (userId: string): string => `sm:noteadd:m:${userId}`,

  SETTINGS:             'sm:settings',
  SETTINGS_ROLES:       'sm:set:roles',
  SETTINGS_ROLES_SEL:   'sm:set:roles:select',
  SETTINGS_INACTIVE:    'sm:set:inactive',
  SETTINGS_INACTIVE_M:  'sm:set:inactive:m',

  POINTS:           'sm:points',
  POINTS_SELECT:    'sm:points:select',
  pointsModal:      (action: string): string => `sm:points:m:${action}`,
} as const;

export function isSMInteraction(customId: string): boolean {
  return customId.startsWith('sm:');
}
