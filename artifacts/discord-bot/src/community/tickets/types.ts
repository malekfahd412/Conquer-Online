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
  /**
   * Ticket Type Designer: every setting a ticket type can independently own.
   * All fields optional — unset fields fall back to the panel's own value.
   * Use `resolveTicketType()` to get the effective merged config.
   */
  overrides?: TicketTypeOverrides;
}

export interface TicketSelectMenuOption {
  label: string;
  value: string;
  ticketType: string;
  description?: string;
  emoji?: string;
  /** Form Builder (Phase 4): which TicketForm to open for this ticket type. Falls back to legacy `modal` when unset. */
  formId?: string;
  /**
   * Ticket Type Designer: every setting a ticket type can independently own.
   * All fields optional — unset fields fall back to the panel's own value.
   * Use `resolveTicketType()` to get the effective merged config.
   */
  overrides?: TicketTypeOverrides;
}

/**
 * Every panel-level setting a single ticket type (button or select option) can
 * independently own. All fields optional; when unset the panel's own value is
 * used. See `resolveTicketType()` for the merge logic.
 */
export interface TicketTypeOverrides {
  // Categories & logging
  openCategory?: string;
  closedCategory?: string;
  archiveCategory?: string;
  logChannelId?: string;

  // Roles
  supportRoles?: string[];
  managerRoles?: string[];
  adminRoles?: string[];
  pingRoles?: string[];

  // Access gating
  allowedRoles?: string[];
  blockedRoles?: string[];
  allowedUsers?: string[];
  blockedUsers?: string[];

  // Permission rules
  permissions?: TicketPermissionOverwrite[];
  memberPerms?: TicketMemberPermConfig;
  staffPerms?: TicketStaffPermConfig;
  visibility?: TicketVisibilityMode;
  claimBehaviour?: TicketClaimBehaviourConfig;

  // Naming & limits
  namingScheme?: string;
  ticketLimit?: number;
  cooldown?: number;
  priority?: TicketPriority;

  // Lifecycle
  transcript?: TicketTranscriptConfig;
  automation?: TicketAutomationConfig;
  statistics?: TicketStatisticsConfig;

  /**
   * Welcome embed shown inside the created ticket channel — distinct from the panel's
   * selection-message `embed`. Every field is independently optional: a field left unset
   * falls back to the panel/engine default for that field (see `createChannel` in
   * ticket-engine.ts) without affecting any other field or any other ticket type.
   */
  ticketEmbed?: Partial<TicketEmbedConfig>;
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
    adminRoles:        p.adminRoles     ?? [],
    memberPerms:       p.memberPerms    ?? { ...DEFAULT_MEMBER_PERMS },
    staffPerms:        p.staffPerms     ?? { ...DEFAULT_STAFF_PERMS },
    visibility:        p.visibility     ?? 'private',
    claimBehaviour:    p.claimBehaviour ?? { ...DEFAULT_CLAIM_BEHAVIOUR },
    forms:             p.forms          ?? [],
    button:            migrateEntryOverrides(panel.button),
    additionalButtons: (panel.additionalButtons ?? []).map(migrateEntryOverrides),
    selectMenu: panel.selectMenu
      ? { ...panel.selectMenu, options: panel.selectMenu.options.map(migrateEntryOverrides) }
      : panel.selectMenu,
  };
}

/** Migrates the old single `categoryId` field (pre Ticket Type Designer) into `overrides.openCategory`. */
function migrateEntryOverrides<T extends { overrides?: TicketTypeOverrides }>(entry: T): T {
  const legacy = entry as T & { categoryId?: string };
  if (legacy.categoryId && !entry.overrides?.openCategory) {
    const { categoryId, ...rest } = legacy;
    return { ...rest, overrides: { ...entry.overrides, openCategory: categoryId } } as T;
  }
  if (legacy.categoryId !== undefined) {
    const { categoryId, ...rest } = legacy;
    return rest as T;
  }
  return entry;
}

// ── Ticket Type resolution (Ticket Type Designer) ───────────────────────────
//
// Each button/select-option is a fully independent "ticket type" that can own
// every panel-level setting via its optional `overrides`. Engines never need
// to know about ticket types directly — callers resolve a per-type effective
// `TicketPanel`-shaped config once, then pass that into the existing engines
// exactly as they would a raw panel.

export type TicketEntryConfig = TicketButtonConfig | TicketSelectMenuOption;

/** A stable reference to one entry: 'b' = primary button, 'x<idx>' = extra button, 's<idx>' = select option. */
export type TicketEntryRef = string;

export function parseEntryRef(ref: TicketEntryRef): { kind: 'b' | 'x' | 's'; idx: number } {
  if (ref === 'b') return { kind: 'b', idx: -1 };
  return { kind: ref[0] as 'x' | 's', idx: parseInt(ref.slice(1), 10) };
}

/** Finds the button/option that owns `ticketType` on this panel, returning its stable ref, or undefined if none matches. */
export function entryRefForTicketType(panel: TicketPanel, ticketType: string): TicketEntryRef | undefined {
  if (panel.button.ticketType === ticketType) return 'b';
  const xi = panel.additionalButtons.findIndex(b => b.ticketType === ticketType);
  if (xi >= 0) return `x${xi}`;
  const si = panel.selectMenu?.options.findIndex(o => o.ticketType === ticketType) ?? -1;
  if (si >= 0) return `s${si}`;
  return undefined;
}

/** Resolves a ref to its entry config. Returns undefined if the ref is stale (e.g. entry removed). */
export function getEntry(panel: TicketPanel, ref: TicketEntryRef): TicketEntryConfig | undefined {
  const { kind, idx } = parseEntryRef(ref);
  if (kind === 'b') return panel.button;
  if (kind === 'x') return panel.additionalButtons[idx];
  return panel.selectMenu?.options[idx];
}

/** Short admin-facing label for an entry, e.g. "🔘 Primary Button" or "📋 Option #2". */
export function entryLabel(panel: TicketPanel, ref: TicketEntryRef): string {
  const entry = getEntry(panel, ref);
  const { kind, idx } = parseEntryRef(ref);
  const name = entry?.label ?? '(missing)';
  if (kind === 'b') return `🔘 Primary Button — ${name}`;
  if (kind === 'x') return `🔘 Extra Button #${idx + 1} — ${name}`;
  return `📋 Select Option #${idx + 1} — ${name}`;
}

/** A resolved, ticket-type-specific config. Structurally a `TicketPanel` — pass it anywhere a panel is expected. */
export interface ResolvedTicketConfig extends TicketPanel {
  /** Per-type welcome-embed override, if the ticket type set one. Undefined = use the engine's hardcoded default template. */
  ticketEmbedOverride?: Partial<TicketEmbedConfig>;
  /** The ref this config was resolved for, for diagnostics. */
  resolvedFor?: TicketEntryRef;
}

/**
 * Slugifies a button/select-option label into a lowercase, hyphen-separated
 * channel-name prefix, e.g. "Report Player" -> "report-player". Falls back to
 * "ticket" if the label has no usable characters (e.g. an emoji-only label).
 */
export function slugifyTicketTypeLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 40) || 'ticket';
}

/**
 * Merges `panel` with the overrides owned by the ticket type matching `ticketType`.
 * Every engine already reads plain `TicketPanel` fields — pass the result of this
 * function into ticket-engine/category-engine/permission-engine/transcript-engine/
 * automation-engine instead of the raw panel whenever the action is for a specific
 * ticket/ticketType (opening, closing, claiming, transcript delivery, etc).
 * Falls back to the raw panel unchanged when no matching entry or overrides exist.
 */
export function resolveTicketType(panel: TicketPanel, ticketType: string): ResolvedTicketConfig {
  const ref = entryRefForTicketType(panel, ticketType);
  const entry = ref ? getEntry(panel, ref) : undefined;
  // The channel-naming default is no longer the generic panel-wide scheme — each
  // ticket type names its own channels from its button/option label (e.g. "Report
  // Player" -> "report-player-{counter}") unless it has its own explicit override.
  const defaultNamingScheme = entry ? `${slugifyTicketTypeLabel(entry.label)}-{counter}` : panel.namingScheme;

  const o = entry?.overrides;
  if (!o) return { ...panel, namingScheme: defaultNamingScheme, resolvedFor: ref };

  return {
    ...panel,
    openCategory:    o.openCategory    ?? panel.openCategory,
    closedCategory:  o.closedCategory  ?? panel.closedCategory,
    archiveCategory: o.archiveCategory ?? panel.archiveCategory,
    logChannelId:    o.logChannelId    ?? panel.logChannelId,

    supportRoles: o.supportRoles ?? panel.supportRoles,
    managerRoles: o.managerRoles ?? panel.managerRoles,
    adminRoles:   o.adminRoles   ?? panel.adminRoles,
    pingRoles:    o.pingRoles    ?? panel.pingRoles,

    allowedRoles: o.allowedRoles ?? panel.allowedRoles,
    blockedRoles: o.blockedRoles ?? panel.blockedRoles,
    allowedUsers: o.allowedUsers ?? panel.allowedUsers,
    blockedUsers: o.blockedUsers ?? panel.blockedUsers,

    permissions:    o.permissions    ?? panel.permissions,
    memberPerms:    o.memberPerms    ?? panel.memberPerms,
    staffPerms:     o.staffPerms     ?? panel.staffPerms,
    visibility:     o.visibility     ?? panel.visibility,
    claimBehaviour: o.claimBehaviour ?? panel.claimBehaviour,

    namingScheme: o.namingScheme ?? defaultNamingScheme,
    ticketLimit:  o.ticketLimit  ?? panel.ticketLimit,
    cooldown:     o.cooldown     ?? panel.cooldown,
    priority:     o.priority     ?? panel.priority,

    transcript: o.transcript ?? panel.transcript,
    automation: o.automation ?? panel.automation,
    statistics: o.statistics ?? panel.statistics,

    ticketEmbedOverride: o.ticketEmbed,
    resolvedFor: ref,
  };
}

/**
 * Returns a `TicketPanel`-shaped patch (suitable for `panelManager.update`) that
 * writes a full replacement `overrides` object onto the entry identified by `ref`.
 * Callers compute the new overrides object first (merging in edits or deleting
 * cleared fields) then pass it here.
 */
export function setEntryOverrides(panel: TicketPanel, ref: TicketEntryRef, overrides: TicketTypeOverrides): Partial<TicketPanel> {
  const { kind, idx } = parseEntryRef(ref);
  if (kind === 'b') {
    return { button: { ...panel.button, overrides } };
  }
  if (kind === 'x') {
    const arr = [...panel.additionalButtons];
    if (!arr[idx]) return {};
    arr[idx] = { ...arr[idx], overrides };
    return { additionalButtons: arr };
  }
  if (!panel.selectMenu || !panel.selectMenu.options[idx]) return {};
  const opts = [...panel.selectMenu.options];
  opts[idx] = { ...opts[idx], overrides };
  return { selectMenu: { ...panel.selectMenu, options: opts } };
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
  /** The permanent welcome/header message sent once when the channel is created. Never
   *  overwritten afterward — close/reopen must never edit or replace this message. */
  headerMessageId?: string;
  /** The most recently sent close/reopen lifecycle message (e.g. the current "Ticket Closed"
   *  notice). Tracked so a later reopen/close can disable that message's now-obsolete controls
   *  without touching the header or any other message. */
  lastLifecycleMessageId?: string;
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
  /** Ticket type this cooldown applies to — each ticket type tracks its own cooldown clock. */
  ticketType: string;
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
