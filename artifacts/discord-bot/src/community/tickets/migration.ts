// ─────────────────────────────────────────────────────────────────────────────
// Migration — one-time, idempotent conversion of the legacy flat
// data/tickets.json (panels + tickets + counters) into the new per-engine
// storage under data/tickets/. Runs automatically on TicketSystem init and
// is guarded by settings.json so it never re-runs (and never re-duplicates
// migrated panels/tickets) once complete. The legacy file is left in place,
// untouched, as a safety copy — nothing is deleted.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import { JsonStore, legacyDataPath } from './store';
import { panelManager } from './panel-manager';
import { ticketEngine } from './ticket-engine';
import type { TicketPanel, TicketRecord, TicketSettings } from './types';
import { logger } from '../../utils/logger';

interface LegacyButton {
  label: string;
  emoji?: string;
  style: 'Primary' | 'Secondary' | 'Success' | 'Danger';
  ticketType: string;
}

interface LegacyPanel {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  title: string;
  description: string;
  color: number;
  footer?: string;
  thumbnail?: string;
  banner?: string;
  buttons: LegacyButton[];
  categoryId?: string;
  supportRoleIds: string[];
  allowedRoleIds: string[];
  blockedRoleIds: string[];
  maxTicketsPerUser: number;
  namingFormat: string;
  transcriptChannelId?: string;
  logChannelId?: string;
  archiveCategoryId?: string;
  autoClose: boolean;
  autoDelete: boolean;
  inactiveTimeoutMinutes: number;
  createdAt: number;
}

interface LegacyTicket {
  id: string;
  guildId: string;
  panelId: string;
  ticketType: string;
  channelId: string;
  openerId: string;
  claimedBy?: string;
  status: 'open' | 'closed' | 'locked';
  number: number;
  createdAt: number;
  closedAt?: number;
  closedBy?: string;
  firstStaffReplyAt?: number;
  participantIds: string[];
}

interface LegacyData {
  panels: LegacyPanel[];
  tickets: LegacyTicket[];
  counters: Record<string, number>;
}

export const settingsStore = new JsonStore<TicketSettings>('settings.json', () => ({
  schemaVersion: 1,
  migratedFromLegacy: false,
  defaultEmbedColor: 0x5865f2,
  defaultNamingScheme: '{displayname}-{counter}',
  defaultTicketLimit: 1,
}));

function convertPanel(legacy: LegacyPanel): TicketPanel {
  const [primary, ...rest] = legacy.buttons.length > 0 ? legacy.buttons : [{ label: 'Open Ticket', style: 'Primary' as const, ticketType: 'General' }];
  const now = Date.now();

  return {
    id: legacy.id,
    guildId: legacy.guildId,
    name: legacy.title,
    description: legacy.description,
    channelId: legacy.channelId,
    messageId: legacy.messageId,
    embed: {
      title: legacy.title,
      description: legacy.description,
      color: legacy.color,
      footer: legacy.footer,
      thumbnail: legacy.thumbnail,
      banner: legacy.banner,
    },
    button: { label: primary.label, emoji: primary.emoji, style: primary.style, ticketType: primary.ticketType },
    additionalButtons: rest.map(b => ({ label: b.label, emoji: b.emoji, style: b.style, ticketType: b.ticketType })),
    selectMenu: undefined,
    permissions: [],
    // Legacy support roles received ManageChannels + were pinged on open — preserve that
    // exact behavior by mapping them into both supportRoles/managerRoles and pingRoles.
    supportRoles: legacy.supportRoleIds,
    managerRoles: legacy.supportRoleIds,
    pingRoles: legacy.supportRoleIds,
    allowedRoles: legacy.allowedRoleIds,
    blockedRoles: legacy.blockedRoleIds,
    allowedUsers: [],
    blockedUsers: [],
    adminRoles: [],
    memberPerms: {
      viewChannel: true, sendMessages: true, attachFiles: true, embedLinks: true,
      addReactions: false, useExternalEmojis: false, useExternalStickers: false,
      mentionEveryone: false, createPublicThreads: false, createPrivateThreads: false,
      sendVoiceMessages: true, readMessageHistory: true, useApplicationCommands: false,
    },
    staffPerms: {
      manageMessages: true, manageThreads: false, manageChannels: false, managePermissions: false,
      mentionEveryone: false, manageWebhooks: false, manageEvents: false, priorityOverride: false,
    },
    visibility: 'private',
    claimBehaviour: { hideFromOtherStaffOnClaim: false, keepVisible: true, managerOverride: true, adminOverride: true },
    openCategory: legacy.categoryId,
    closedCategory: undefined,
    archiveCategory: legacy.archiveCategoryId,
    logChannelId: legacy.logChannelId,
    namingScheme: legacy.namingFormat,
    ticketLimit: legacy.maxTicketsPerUser,
    cooldown: 0,
    priority: 'normal',
    modal: { enabled: false, questions: [] },
    forms: [],
    transcript: {
      enabled: !!legacy.transcriptChannelId,
      channelId: legacy.transcriptChannelId,
      formats: ['html'],
      dmUser: false,
    },
    automation: {
      autoCloseInactivityMinutes: legacy.autoClose ? legacy.inactiveTimeoutMinutes : 0,
      autoDeleteAfterCloseMinutes: legacy.autoDelete ? 1 / 6 : 0, // legacy auto-delete fired 10s after close
      cooldownSeconds: 0,
      reminderMinutes: 0,
    },
    statistics: { trackResponseTime: true, trackClaims: true },
    createdAt: legacy.createdAt,
    updatedAt: now,
    enabled: true,
  };
}

function convertTicket(legacy: LegacyTicket): TicketRecord {
  return {
    id: legacy.id,
    guildId: legacy.guildId,
    panelId: legacy.panelId,
    ticketType: legacy.ticketType,
    channelId: legacy.channelId,
    openerId: legacy.openerId,
    claimedBy: legacy.claimedBy,
    status: legacy.status,
    number: legacy.number,
    priority: 'normal',
    answers: {},
    createdAt: legacy.createdAt,
    closedAt: legacy.closedAt,
    closedBy: legacy.closedBy,
    firstStaffReplyAt: legacy.firstStaffReplyAt,
    lastActivityAt: legacy.closedAt ?? legacy.createdAt,
    participantIds: legacy.participantIds,
  };
}

export async function runMigration(): Promise<void> {
  const settings = await settingsStore.read();
  if (settings.migratedFromLegacy) return;

  let legacy: LegacyData | undefined;
  try {
    const raw = await fs.readFile(legacyDataPath(), 'utf-8');
    legacy = JSON.parse(raw) as LegacyData;
  } catch {
    legacy = undefined;
  }

  if (legacy && (legacy.panels.length > 0 || legacy.tickets.length > 0)) {
    const panels = legacy.panels.map(convertPanel);
    const tickets = legacy.tickets.map(convertTicket);
    await panelManager.importRaw(panels);
    await ticketEngine.importRaw(tickets, legacy.counters ?? {});
    logger.success(`[TICKETS] Migrated ${panels.length} legacy panel(s) and ${tickets.length} legacy ticket(s) into the new Ticket System Pro storage.`);
  } else {
    logger.info('[TICKETS] No legacy ticket data found — starting fresh on Ticket System Pro.');
  }

  await settingsStore.mutate(data => {
    data.migratedFromLegacy = true;
    data.migratedAt = Date.now();
  });
}
