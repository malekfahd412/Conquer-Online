// ─────────────────────────────────────────────────────────────────────────────
// Shared default values for a new ticket panel. Used by PanelManager callers
// (AI tools, slash commands) and TemplateEngine's built-in presets so both
// paths produce panels with sane, non-placeholder defaults.
// ─────────────────────────────────────────────────────────────────────────────
import type { TicketEmbedConfig, TicketButtonConfig, TicketPanel } from './types';
import { DEFAULT_MEMBER_PERMS, DEFAULT_STAFF_PERMS, DEFAULT_CLAIM_BEHAVIOUR } from './types';

export type PanelDefaultFields = Omit<
  TicketPanel,
  'id' | 'guildId' | 'name' | 'description' | 'channelId' | 'messageId' | 'embed' | 'button' | 'createdAt' | 'updatedAt'
>;

export function defaultPanelFields(): PanelDefaultFields {
  return {
    additionalButtons: [],
    selectMenu: undefined,
    permissions: [],
    supportRoles: [],
    managerRoles: [],
    adminRoles: [],
    pingRoles: [],
    allowedRoles: [],
    blockedRoles: [],
    allowedUsers: [],
    blockedUsers: [],
    memberPerms: { ...DEFAULT_MEMBER_PERMS },
    staffPerms: { ...DEFAULT_STAFF_PERMS },
    visibility: 'private',
    claimBehaviour: { ...DEFAULT_CLAIM_BEHAVIOUR },
    openCategory: undefined,
    closedCategory: undefined,
    archiveCategory: undefined,
    logChannelId: undefined,
    namingScheme: '{displayname}-{counter}',
    ticketLimit: 1,
    cooldown: 0,
    priority: 'normal',
    modal: { enabled: false, questions: [] },
    forms: [],
    transcript: { enabled: false, channelId: undefined, formats: ['html'], dmUser: false },
    automation: { autoCloseInactivityMinutes: 0, autoDeleteAfterCloseMinutes: 0, cooldownSeconds: 0, reminderMinutes: 0, ageWarnMinutes: 0 },
    statistics: { trackResponseTime: true, trackClaims: true },
    enabled: true,
  };
}

export function defaultEmbed(title: string, description: string, color = 0x5865f2): TicketEmbedConfig {
  return { title, description, color };
}

export function defaultButton(label: string, ticketType: string): TicketButtonConfig {
  return { label, style: 'Primary', ticketType };
}
