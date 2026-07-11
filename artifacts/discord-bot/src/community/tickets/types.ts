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
}

export interface TicketSelectMenuOption {
  label: string;
  value: string;
  ticketType: string;
  description?: string;
  emoji?: string;
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
