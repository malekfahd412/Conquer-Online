// ─────────────────────────────────────────────────────────────────────────────
// Staff Management Pro — shared types.
//
// Architecture: every other system (Tickets, Moderation, Verification, voice
// tools, the security-report tool) reports staff activity by emitting a
// `staffEventBus` event (see staff-events.ts) instead of writing to any of
// the files below directly. `staff.service.ts` is the ONLY consumer of those
// events and the only writer of staff.json / staff-points.json /
// staff-goals.json / staff-reports.json.
// ─────────────────────────────────────────────────────────────────────────────

/** Every trackable staff action. Also doubles as the configurable point-value key. */
export type StaffActionType =
  | 'ticket_claimed'
  | 'ticket_closed'
  | 'ticket_reopened'
  | 'warn_issued'
  | 'unwarn_issued'
  | 'mute_issued'
  | 'unmute_issued'
  | 'kick_issued'
  | 'ban_issued'
  | 'tempban_issued'
  | 'unban_issued'
  | 'softban_issued'
  | 'purge_issued'
  | 'verification_approved'
  | 'verification_rejected'
  | 'security_action'
  | 'voice_mod_action';

export const ALL_STAFF_ACTIONS: StaffActionType[] = [
  'ticket_claimed', 'ticket_closed', 'ticket_reopened',
  'warn_issued', 'unwarn_issued', 'mute_issued', 'unmute_issued',
  'kick_issued', 'ban_issued', 'tempban_issued', 'unban_issued', 'softban_issued',
  'purge_issued', 'verification_approved', 'verification_rejected',
  'security_action', 'voice_mod_action',
];

export const STAFF_ACTION_LABELS: Record<StaffActionType, string> = {
  ticket_claimed:         '🎫 Ticket Claimed',
  ticket_closed:          '🔒 Ticket Closed',
  ticket_reopened:        '🔓 Ticket Reopened',
  warn_issued:            '⚠️ Warning Issued',
  unwarn_issued:          '✅ Warning Removed',
  mute_issued:            '🔇 Mute/Timeout Issued',
  unmute_issued:          '🔊 Mute Removed',
  kick_issued:            '👢 Kick Issued',
  ban_issued:             '🔨 Ban Issued',
  tempban_issued:         '⏳ Temp-ban Issued',
  unban_issued:           '♻️ Unban Issued',
  softban_issued:         '🧹 Softban Issued',
  purge_issued:           '🗑️ Messages Purged',
  verification_approved:  '✅ Verification Approved',
  verification_rejected:  '❌ Verification Rejected',
  security_action:        '🛡️ Security Action',
  voice_mod_action:       '🔊 Voice Moderation Action',
};

/** Default point values, used the first time a guild's config is created. */
export const DEFAULT_STAFF_POINTS: Record<StaffActionType, number> = {
  ticket_claimed: 5,
  ticket_closed: 10,
  ticket_reopened: 0,
  warn_issued: 3,
  unwarn_issued: 1,
  mute_issued: 4,
  unmute_issued: 2,
  kick_issued: 6,
  ban_issued: 8,
  tempban_issued: 7,
  unban_issued: 2,
  softban_issued: 6,
  purge_issued: 2,
  verification_approved: 2,
  verification_rejected: 1,
  security_action: 3,
  voice_mod_action: 2,
};

export type StaffStatus = 'active' | 'inactive' | 'on_leave';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'alltime';

export interface StaffWarning {
  id: string;
  reason: string;
  moderatorId: string;
  moderatorTag: string;
  timestamp: number;
}

export interface StaffNote {
  id: string;
  authorId: string;
  authorTag: string;
  content: string;
  timestamp: number;
}

export interface StaffTimelineEvent {
  id: string;
  action: StaffActionType | 'shift_start' | 'shift_end' | 'note_added' | 'warning_added';
  description: string;
  timestamp: number;
}

/** Auto-tracked lifetime counters, kept in lockstep with the timeline. */
export type StaffActionCounts = Record<StaffActionType, number>;

export function emptyActionCounts(): StaffActionCounts {
  const counts = {} as StaffActionCounts;
  for (const a of ALL_STAFF_ACTIONS) counts[a] = 0;
  return counts;
}

export interface StaffProfile {
  userId: string;
  guildId: string;
  firstTrackedAt: number;
  status: StaffStatus;
  lastActivityAt: number;
  totalActivityMs: number;
  currentShiftStartedAt?: number;
  counts: StaffActionCounts;
  /** Sum/sample pairs so avg-ms can be derived without storing every sample. */
  firstResponseTotalMs: number;
  firstResponseSamples: number;
  resolutionTotalMs: number;
  resolutionSamples: number;
  warnings: StaffWarning[];
  notes: StaffNote[];
  timeline: StaffTimelineEvent[];
}

export function makeDefaultProfile(guildId: string, userId: string): StaffProfile {
  const now = Date.now();
  return {
    userId,
    guildId,
    firstTrackedAt: now,
    status: 'active',
    lastActivityAt: now,
    totalActivityMs: 0,
    counts: emptyActionCounts(),
    firstResponseTotalMs: 0,
    firstResponseSamples: 0,
    resolutionTotalMs: 0,
    resolutionSamples: 0,
    warnings: [],
    notes: [],
    timeline: [],
  };
}

export interface ShiftSession {
  id: string;
  userId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface StaffGuildSettings {
  trackedRoleIds: string[];
  inactiveThresholdDays: number;
}

export function makeDefaultSettings(): StaffGuildSettings {
  return { trackedRoleIds: [], inactiveThresholdDays: 14 };
}

export interface StaffGuildData {
  guildId: string;
  settings: StaffGuildSettings;
  profiles: Record<string, StaffProfile>;
  shiftLog: ShiftSession[];
}

export interface StaffPointTransaction {
  id: string;
  guildId: string;
  userId: string;
  action: StaffActionType;
  points: number;
  timestamp: number;
}

export interface StaffPointsGuildData {
  guildId: string;
  pointValues: Record<StaffActionType, number>;
  transactions: StaffPointTransaction[];
}

export type GoalMetric = StaffActionType | 'points' | 'shift_hours';

export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'alltime';

export interface StaffGoal {
  id: string;
  guildId: string;
  label: string;
  metric: GoalMetric;
  target: number;
  period: GoalPeriod;
  createdAt: number;
  createdBy: string;
  completedAt?: number;
}

export interface StaffReportRecord {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  generatedAt: number;
  summary: string;
}

export interface StaffReportsGuildData {
  guildId: string;
  channelId?: string;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  lastDailyKey?: string;
  lastWeeklyKey?: string;
  lastMonthlyKey?: string;
  history: StaffReportRecord[];
}
