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
  pingRoles: string[];
  allowedRoles: string[];
  blockedRoles: string[];
  allowedUsers: string[];
  blockedUsers: string[];

  openCategory?: string;
  closedCategory?: string;
  archiveCategory?: string;
  /** Channel that open/close/claim actions are logged to. Not part of the spec's named field
   *  list, but the legacy panel model had it and dropping it would silently remove a feature. */
  logChannelId?: string;

  namingScheme: string;
  ticketLimit: number;
  cooldown: number; // seconds between closing and opening a new ticket on this panel
  priority: TicketPriority;

  modal: TicketModalConfig;
  transcript: TicketTranscriptConfig;
  automation: TicketAutomationConfig;
  statistics: TicketStatisticsConfig;

  createdAt: number;
  updatedAt: number;
  enabled: boolean;
  archivedAt?: number;
}

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
