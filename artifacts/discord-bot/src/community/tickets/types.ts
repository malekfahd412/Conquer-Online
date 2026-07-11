// ─────────────────────────────────────────────────────────────────────────────
// Ticket System Pro — shared type contracts
//
// These types are the single source of truth for the shape of a ticket panel,
// a live ticket, and the configuration objects each engine consumes. Engines
// only import from this file and from their own storage module — never from
// another engine's storage module directly.
// ─────────────────────────────────────────────────────────────────────────────

export type TicketButtonStyle = 'Primary' | 'Secondary' | 'Success' | 'Danger';

export interface TicketEmbedConfig {
  title: string;
  description: string;
  color: number;
  footer?: string;
  thumbnail?: string;
  banner?: string;
  author?: string;
  showTimestamp?: boolean;
}

export interface TicketButtonConfig {
  label: string;
  emoji?: string;
  style: TicketButtonStyle;
  ticketType: string;
  /** Form Builder (Phase 4): which TicketForm to open for this ticket type. Falls back to legacy `modal` when unset. */
  formId?: string;
}

export interface TicketSelectMenuOption {
  label: string;
  value: string;
  ticketType: string;
  description?: string;
  emoji?: string;
  /** Form Builder (Phase 4): which TicketForm to open for this ticket type. Falls back to legacy `modal` when unset. */
  formId?: string;
}

export interface TicketSelectMenuConfig {
  placeholder?: string;
  options: TicketSelectMenuOption[];
}

/** Extra, hand-authored permission overwrites layered on top of the engine-computed ones. */
export interface TicketPermissionOverwrite {
  targetId: string;
  targetType: 'role' | 'user';
  allow: string[];
  deny: string[];
}

export interface TicketModalQuestion {
  id: string;
  label: string;
  style: 'short' | 'paragraph';
  placeholder?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface TicketModalConfig {
  enabled: boolean;
  title?: string;
  questions: TicketModalQuestion[];
}

// ── Question / Form Builder (Phase 4) ───────────────────────────────────────
//
// Replaces the legacy single 5-question `modal` above with unlimited,
// chainable forms (still capped at 5 questions per individual form, which is
// a hard Discord modal limit). `modal` is kept for backward compatibility —
// panels created before this feature keep working exactly as before.

export type QuestionType =
  | 'short_text'
  | 'paragraph'
  | 'email'
  | 'number'
  | 'discord_username'
  | 'discord_user_id'
  | 'role_mention'
  | 'channel_mention'
  | 'url'
  | 'date';

export const QUESTION_TYPES: QuestionType[] = [
  'short_text', 'paragraph', 'email', 'number', 'discord_username',
  'discord_user_id', 'role_mention', 'channel_mention', 'url', 'date',
];

export const QUESTION_TYPE_META: Record<QuestionType, { label: string; emoji: string; hint: string }> = {
  short_text:       { label: 'Short Text',       emoji: '✏️', hint: 'A single line of free text' },
  paragraph:        { label: 'Paragraph',        emoji: '📝', hint: 'Multi-line free text' },
  email:            { label: 'Email',            emoji: '📧', hint: 'Must look like an email address' },
  number:           { label: 'Number',           emoji: '🔢', hint: 'Digits only (integer or decimal)' },
  discord_username: { label: 'Discord Username', emoji: '👤', hint: 'A Discord username, e.g. name' },
  discord_user_id:  { label: 'Discord User ID',  emoji: '🆔', hint: 'A raw 17-20 digit Discord user ID' },
  role_mention:     { label: 'Role Mention',     emoji: '🏷️', hint: 'A role mention or raw role ID' },
  channel_mention:  { label: 'Channel Mention',  emoji: '📺', hint: 'A channel mention or raw channel ID' },
  url:              { label: 'URL',              emoji: '🔗', hint: 'Must be a valid http(s) link' },
  date:             { label: 'Date',             emoji: '📅', hint: 'YYYY-MM-DD format' },
};

/** Condition gating whether a question is shown, based on an answer from an EARLIER form in the same chain. */
export interface FormQuestionCondition {
  /** Question id from an earlier form (or the special key 'ticketType'). */
  questionId: string;
  /** Case-insensitive equality match against the previously submitted value. */
  equals: string;
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  title: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  defaultValue?: string;
  validationRegex?: string;
  errorMessage?: string;
  /** Same-form self-referential conditionals are impossible in Discord modals — this only looks at earlier forms. */
  showIf?: FormQuestionCondition;
}

/** Routing rule evaluated against this form's just-submitted answers to pick the next form in the chain. */
export interface FormNextRule {
  questionId: string;
  equals: string;
  nextFormId: string;
}

export interface TicketForm {
  id: string;
  name: string;
  description?: string;
  /** Max 5 — hard Discord modal limit. */
  questions: FormQuestion[];
  nextRules: FormNextRule[];
  /** Used when no nextRules match and a chain continuation is still desired. */
  defaultNextFormId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TicketTranscriptConfig {
  enabled: boolean;
  channelId?: string;
  formats: Array<'markdown' | 'html'>;
  dmUser: boolean;
}

export interface TicketAutomationConfig {
  autoCloseInactivityMinutes: number; // 0 = disabled
  autoDeleteAfterCloseMinutes: number; // 0 = disabled
  cooldownSeconds: number; // 0 = disabled
  reminderMinutes: number; // 0 = disabled — nudges staff if unclaimed
}

export interface TicketStatisticsConfig {
  trackResponseTime: boolean;
  trackClaims: boolean;
}

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

// ── Permission Designer types ────────────────────────────────────────────────

export type TicketVisibilityMode = 'private' | 'support_only' | 'shared_support' | 'public';

/** Fine-grained permissions granted to the ticket opener (member) inside the channel. */
export interface TicketMemberPermConfig {
  viewChannel: boolean;
  sendMessages: boolean;
  attachFiles: boolean;
  embedLinks: boolean;
  addReactions: boolean;
  useExternalEmojis: boolean;
  useExternalStickers: boolean;
  mentionEveryone: boolean;
  createPublicThreads: boolean;
  createPrivateThreads: boolean;
  sendVoiceMessages: boolean;
  readMessageHistory: boolean;
  useApplicationCommands: boolean;
}

/** Fine-grained permissions granted to staff (support/manager/admin) inside the channel. */
export interface TicketStaffPermConfig {
  manageMessages: boolean;
  manageThreads: boolean;
  manageChannels: boolean;
  managePermissions: boolean;
  mentionEveryone: boolean;
  manageWebhooks: boolean;
  manageEvents: boolean;
  priorityOverride: boolean;
}

/** Behaviour when a staff member claims a ticket. */
export interface TicketClaimBehaviourConfig {
  hideFromOtherStaffOnClaim: boolean;
  keepVisible: boolean;
  managerOverride: boolean;
  adminOverride: boolean;
}

export const DEFAULT_MEMBER_PERMS: TicketMemberPermConfig = {
  viewChannel: true,
  sendMessages: true,
  attachFiles: true,
  embedLinks: true,
  addReactions: false,
  useExternalEmojis: false,
  useExternalStickers: false,
  mentionEveryone: false,
  createPublicThreads: false,
  createPrivateThreads: false,
  sendVoiceMessages: true,
  readMessageHistory: true,
  useApplicationCommands: false,
};

export const DEFAULT_STAFF_PERMS: TicketStaffPermConfig = {
  manageMessages: true,
  manageThreads: false,
  manageChannels: false,
  managePermissions: false,
  mentionEveryone: false,
  manageWebhooks: false,
  manageEvents: false,
  priorityOverride: false,
};

export const DEFAULT_CLAIM_BEHAVIOUR: TicketClaimBehaviourConfig = {
  hideFromOtherStaffOnClaim: false,
  keepVisible: true,
  managerOverride: true,
  adminOverride: true,
};

// ── TicketPanel ──────────────────────────────────────────────────────────────

/**
 * The full Ticket Panel model. This is the "config" — what an admin sets up.
 * Live ticket instances (`TicketRecord`) are a separate concern owned by TicketEngine.
 */
export interface TicketPanel {
  id: string;
  guildId: string;
  /** Internal admin-facing label for this panel (distinct from the embed title users see). */
  name: string;
  /** Internal admin-facing note describing the panel's purpose (distinct from embed.description). */
  description: string;
  channelId: string;
  messageId?: string;

  embed: TicketEmbedConfig;
  button: TicketButtonConfig;
  /** Optional extra buttons for panels that open more than one ticket type. */
  additionalButtons: TicketButtonConfig[];
  selectMenu?: TicketSelectMenuConfig;

  permissions: TicketPermissionOverwrite[];
  supportRoles: string[];
  managerRoles: string[];
  /** Admin roles — superset of manager; gets ManagePermissions in addition to manager perms. */
  adminRoles: string[];
  pingRoles: string[];
  allowedRoles: string[];
  blockedRoles: string[];
  allowedUsers: string[];
  blockedUsers: string[];

  openCategory?: string;
  closedCategory?: string;
  archiveCategory?: string;
  /** Channel that open/close/claim actions are logged to. */
  logChannelId?: string;

  namingScheme: string;
  ticketLimit: number;
  cooldown: number; // seconds between closing and opening a new ticket on this panel
  priority: TicketPriority;

  /** Fine-grained member permission overrides inside the ticket channel. */
  memberPerms: TicketMemberPermConfig;
  /** Fine-grained staff permission overrides inside the ticket channel. */
  staffPerms: TicketStaffPermConfig;
  /** Controls who can see the panel embed and open tickets. */
  visibility: TicketVisibilityMode;
  /** Behaviour when a staff member claims a ticket. */
  claimBehaviour: TicketClaimBehaviourConfig;

  modal: TicketModalConfig;
  /** Question/Form Builder (Phase 4). Empty array = panel only uses the legacy `modal`, if any. */
  forms: TicketForm[];
  transcript: TicketTranscriptConfig;
  automation: TicketAutomationConfig;
  statistics: TicketStatisticsConfig;

  createdAt: number;
  updatedAt: number;
  enabled: boolean;
  archivedAt?: number;
}

/**
 * Normalises a panel loaded from disk, filling in any missing fields introduced
 * after the initial release (Phase 3 Permission Designer additions).
 * Always call this on panels read from JSON before passing into designer renderers.
 */
export function normalizePanel(panel: TicketPanel): TicketPanel {
  const p = panel as TicketPanel & {
    adminRoles?: string[];
    memberPerms?: TicketMemberPermConfig;
    staffPerms?: TicketStaffPermConfig;
    visibility?: TicketVisibilityMode;
    claimBehaviour?: TicketClaimBehaviourConfig;
  };
  return {
    ...panel,
    adminRoles:     p.adminRoles     ?? [],
    memberPerms:    p.memberPerms    ?? { ...DEFAULT_MEMBER_PERMS },
    staffPerms:     p.staffPerms     ?? { ...DEFAULT_STAFF_PERMS },
    visibility:     p.visibility     ?? 'private',
    claimBehaviour: p.claimBehaviour ?? { ...DEFAULT_CLAIM_BEHAVIOUR },
    forms:          p.forms          ?? [],
  };
}

// ── TicketRecord ─────────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'closed' | 'locked';

export interface TicketRecord {
  id: string;
  guildId: string;
  panelId: string;
  ticketType: string;
  channelId: string;
  openerId: string;
  claimedBy?: string;
  status: TicketStatus;
  number: number;
  priority: TicketPriority;
  answers: Record<string, string>;
  createdAt: number;
  closedAt?: number;
  closedBy?: string;
  firstStaffReplyAt?: number;
  lastActivityAt: number;
  participantIds: string[];
}

// ── Form Answer Storage (Phase 4) ───────────────────────────────────────────
//
// Deliberately separate from TicketRecord.answers — a submitted form is a
// durable record on its own, searchable/exportable/deletable independent of
// the ticket it may have created (owned by AnswerEngine, answers.json).

export interface FormAnswerItem {
  questionId: string;
  title: string;
  type: QuestionType;
  value: string;
}

export interface FormAnswerRecord {
  id: string;
  guildId: string;
  panelId: string;
  panelName: string;
  formId: string;
  formName: string;
  ticketType: string;
  ticketId?: string;
  channelId?: string;
  userId: string;
  userTag: string;
  answers: FormAnswerItem[];
  submittedAt: number;
}

export type FormAnswerAuditAction = 'created' | 'viewed' | 'exported' | 'deleted';

export interface FormAnswerAuditEntry {
  id: string;
  guildId: string;
  action: FormAnswerAuditAction;
  actorId: string;
  answerId?: string;
  detail?: string;
  timestamp: number;
}

export interface TicketTemplate {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  panel: Omit<TicketPanel, 'id' | 'guildId' | 'channelId' | 'messageId' | 'createdAt' | 'updatedAt'>;
  createdAt: number;
  updatedAt: number;
}

export type StatisticsEventType = 'opened' | 'claimed' | 'unclaimed' | 'closed' | 'reopened' | 'deleted';

export interface StatisticsEvent {
  type: StatisticsEventType;
  guildId: string;
  panelId: string;
  ticketId: string;
  userId: string;
  timestamp: number;
  responseMs?: number;
}

export interface AutomationCooldownEntry {
  guildId: string;
  panelId: string;
  userId: string;
  lastClosedAt: number;
}

export interface AutomationActivityEntry {
  ticketId: string;
  channelId: string;
  lastActivityAt: number;
}

export interface AutomationLogEntry {
  ticketId: string;
  action: 'auto-close' | 'auto-delete' | 'reminder';
  timestamp: number;
}

export interface TranscriptRecord {
  ticketId: string;
  guildId: string;
  panelId: string;
  number: number;
  generatedAt: number;
  messageCount: number;
  markdown: string;
  html: string;
  deliveredChannelId?: string;
}

export interface TicketSettings {
  schemaVersion: number;
  migratedFromLegacy: boolean;
  migratedAt?: number;
  defaultEmbedColor: number;
  defaultNamingScheme: string;
  defaultTicketLimit: number;
}
