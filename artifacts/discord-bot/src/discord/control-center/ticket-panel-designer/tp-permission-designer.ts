// ─────────────────────────────────────────────────────────────────────────────
// Ticket Panel Designer — Permission Designer pages
//
// All Discord-native UI for the Permission Designer sub-system. No slash
// commands needed; everything is accessible from the Permissions section of the
// Ticket Panel Designer Control Center.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  normalizePanel,
  DEFAULT_MEMBER_PERMS,
  DEFAULT_STAFF_PERMS,
  type TicketPanel,
  type TicketMemberPermConfig,
  type TicketStaffPermConfig,
  type TicketClaimBehaviourConfig,
  type TicketVisibilityMode,
} from '../../../community/tickets/types';
import { truncate } from '../cc-categories';
import { CC } from '../cc-ids';
import { checkColor, verifyBuilder, assertUniqueCustomIds } from '../cc-debug';
import { TP } from './tp-ids';
import type { CCPayload } from '../cc-renderer';

const FILE = 'tp-permission-designer.ts';

// ── Perm definition tables ───────────────────────────────────────────────────

interface MemberPermDef {
  key: keyof TicketMemberPermConfig;
  emoji: string;
  label: string;
  description: string;
}

interface StaffPermDef {
  key: keyof TicketStaffPermConfig;
  emoji: string;
  label: string;
  description: string;
}

const MEMBER_PERM_DEFS: MemberPermDef[] = [
  { key: 'viewChannel',           emoji: '👁',  label: 'View Channel',  description: 'See the ticket channel' },
  { key: 'sendMessages',          emoji: '💬',  label: 'Send Messages', description: 'Send messages in ticket' },
  { key: 'attachFiles',           emoji: '📎',  label: 'Attach Files',  description: 'Upload attachments' },
  { key: 'embedLinks',            emoji: '🔗',  label: 'Embed Links',   description: 'Embed hyperlinks' },
  { key: 'addReactions',          emoji: '😀',  label: 'Reactions',     description: 'Add emoji reactions' },
  { key: 'useExternalEmojis',     emoji: '🌐',  label: 'Ext Emojis',    description: 'Use emojis from other servers' },
  { key: 'useExternalStickers',   emoji: '🖼',   label: 'Ext Stickers',  description: 'Use stickers from other servers' },
  { key: 'mentionEveryone',       emoji: '📢',  label: 'Mention All',   description: 'Ping @here / @everyone' },
  { key: 'createPublicThreads',   emoji: '🧵',  label: 'Pub Threads',   description: 'Create public threads' },
  { key: 'createPrivateThreads',  emoji: '🔒',  label: 'Priv Threads',  description: 'Create private threads' },
  { key: 'sendVoiceMessages',     emoji: '🎤',  label: 'Voice Msgs',    description: 'Send voice message clips' },
  { key: 'readMessageHistory',    emoji: '📜',  label: 'Msg History',   description: 'Read past messages' },
  { key: 'useApplicationCommands',emoji: '📱',  label: 'App Commands',  description: 'Use slash commands & apps' },
];

const STAFF_PERM_DEFS: StaffPermDef[] = [
  { key: 'manageMessages',    emoji: '🗂',  label: 'Mgr Messages',  description: 'Delete / pin messages' },
  { key: 'manageThreads',     emoji: '🧵',  label: 'Mgr Threads',   description: 'Manage threads in ticket' },
  { key: 'manageChannels',    emoji: '📁',  label: 'Mgr Channels',  description: 'Edit channel settings' },
  { key: 'managePermissions', emoji: '🔐',  label: 'Mgr Perms',     description: 'Manage channel permissions' },
  { key: 'mentionEveryone',   emoji: '📢',  label: 'Mention All',   description: 'Ping @here / @everyone' },
  { key: 'manageWebhooks',    emoji: '🪝',  label: 'Mgr Webhooks',  description: 'Create / edit webhooks' },
  { key: 'manageEvents',      emoji: '📅',  label: 'Mgr Events',    description: 'Create / edit events' },
  { key: 'priorityOverride',  emoji: '⚡',  label: 'Priority',      description: 'Override ticket priority' },
];

const VISIBILITY_DEFS: Array<{ mode: TicketVisibilityMode; emoji: string; label: string; description: string }> = [
  { mode: 'private',        emoji: '🔒', label: 'Private',        description: 'Only opener and staff can see the ticket channel' },
  { mode: 'support_only',   emoji: '👷', label: 'Support Only',   description: 'Opener and staff visible; same as private but semantically distinct' },
  { mode: 'shared_support', emoji: '👥', label: 'Shared Support', description: 'Everyone can view but not send messages' },
  { mode: 'public',         emoji: '🌐', label: 'Public',         description: 'Everyone can view and read history; only staff and opener can send' },
];

// ── Validation ───────────────────────────────────────────────────────────────

interface ValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export function validatePanelPerms(raw: TicketPanel): ValidationResult {
  const panel = normalizePanel(raw);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (
    panel.supportRoles.length === 0 &&
    panel.managerRoles.length === 0 &&
    panel.adminRoles.length === 0
  ) {
    errors.push('No staff roles set — tickets will have no staff access');
  }

  const allowedBlockedRoleOverlap = panel.allowedRoles.filter(id => panel.blockedRoles.includes(id));
  if (allowedBlockedRoleOverlap.length > 0) {
    errors.push(`${allowedBlockedRoleOverlap.length} role(s) are in both Allowed and Blocked lists`);
  }

  const allowedBlockedUserOverlap = panel.allowedUsers.filter(id => panel.blockedUsers.includes(id));
  if (allowedBlockedUserOverlap.length > 0) {
    errors.push(`${allowedBlockedUserOverlap.length} user(s) are in both Allowed and Blocked lists`);
  }

  const allStaffRoles = [...panel.supportRoles, ...panel.managerRoles, ...panel.adminRoles, ...panel.pingRoles];
  const dupStaff = allStaffRoles.filter((id, i) => allStaffRoles.indexOf(id) !== i);
  if (dupStaff.length > 0) {
    warnings.push(`${[...new Set(dupStaff)].length} role(s) appear in multiple staff lists`);
  }

  if (!panel.memberPerms.viewChannel && (panel.visibility === 'private' || panel.visibility === 'support_only')) {
    warnings.push('View Channel is disabled for opener — they cannot see their own ticket');
  }

  if (!panel.memberPerms.sendMessages) {
    warnings.push('Send Messages is disabled — opener cannot reply in their ticket');
  }

  if (panel.claimBehaviour.hideFromOtherStaffOnClaim && panel.claimBehaviour.keepVisible) {
    warnings.push('"Hide on Claim" and "Keep Visible" are both on — Keep Visible takes priority');
  }

  return { ok: errors.length === 0, warnings, errors };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function btn(label: string, id: string, style: ButtonStyle, disabled = false): ButtonBuilder {
  return verifyBuilder(FILE, 'btn', `btn:${id}`, () =>
    new ButtonBuilder().setLabel(truncate(label, 80)).setCustomId(id).setStyle(style).setDisabled(disabled),
  );
}

function homeBtn(): ButtonBuilder  { return btn('🏠 Home',        CC.HOME,         ButtonStyle.Secondary); }
function dashBtn(pid: string)       { return btn('← Dashboard',   TP.dash(pid),    ButtonStyle.Secondary); }
function backPdBtn(pid: string)     { return btn('← Permissions', TP.PD.main(pid), ButtonStyle.Secondary); }

function fmtRoles(ids: string[]): string {
  if (ids.length === 0) return '_None_';
  return truncate(ids.map(id => `<@&${id}>`).join(' '), 512);
}

function fmtUsers(ids: string[]): string {
  if (ids.length === 0) return '_None_';
  return truncate(ids.map(id => `<@${id}>`).join(' '), 512);
}

function validationSummary(v: ValidationResult): string {
  if (v.errors.length === 0 && v.warnings.length === 0) return '✅ All checks passed';
  const lines: string[] = [];
  for (const e of v.errors)   lines.push(`❌ ${e}`);
  for (const w of v.warnings) lines.push(`⚠️ ${w}`);
  return lines.join('\n');
}

function countEnabled<T extends object>(cfg: T): number {
  return Object.values(cfg).filter(Boolean).length;
}

function visLabel(mode: TicketVisibilityMode): string {
  return VISIBILITY_DEFS.find(d => d.mode === mode)?.label ?? mode;
}

function ti(
  id: string,
  label: string,
  style: TextInputStyle,
  value: string,
  placeholder: string,
  required = false,
  maxLength = 1000,
): TextInputBuilder {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(truncate(label, 45))
    .setStyle(style)
    .setPlaceholder(truncate(placeholder, 100))
    .setRequired(required)
    .setMaxLength(Math.min(maxLength, 4000));
  if (value) input.setValue(truncate(value, Math.min(maxLength, 4000)));
  return input;
}

function mrow<T extends TextInputBuilder>(input: T): ActionRowBuilder<T> {
  return new ActionRowBuilder<T>().addComponents(input);
}

// ── buildPDMain ──────────────────────────────────────────────────────────────

export function buildPDMain(raw: TicketPanel): CCPayload {
  const fn = 'buildPDMain';
  const panel = normalizePanel(raw);
  const v = validatePanelPerms(panel);
  const color = checkColor(FILE, fn, 'color', 0xf5a623);

  const memberOn = countEnabled(panel.memberPerms);
  const staffOn  = countEnabled(panel.staffPerms);
  const totalMember = Object.keys(DEFAULT_MEMBER_PERMS).length;
  const totalStaff  = Object.keys(DEFAULT_STAFF_PERMS).length;

  const claimSummary = [
    panel.claimBehaviour.hideFromOtherStaffOnClaim ? '🙈 Hide on Claim' : null,
    panel.claimBehaviour.keepVisible               ? '👁 Keep Visible'  : null,
    panel.claimBehaviour.managerOverride           ? '🛠 Mgr Override'  : null,
    panel.claimBehaviour.adminOverride             ? '👑 Admin Override': null,
  ].filter(Boolean).join(', ') || '_None configured_';

  const staffCount = [
    panel.supportRoles.length ? `${panel.supportRoles.length} support` : null,
    panel.managerRoles.length ? `${panel.managerRoles.length} manager` : null,
    panel.adminRoles.length   ? `${panel.adminRoles.length} admin`     : null,
    panel.pingRoles.length    ? `${panel.pingRoles.length} ping`       : null,
  ].filter(Boolean).join(', ') || '_None configured_';

  const embed = verifyBuilder(FILE, fn, 'main embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🔐 Permission Designer')
      .setDescription('Configure who can open tickets, what members can do inside tickets, and how staff permissions work.')
      .addFields(
        { name: '👷 Support Team',        value: staffCount,                                         inline: false },
        { name: '🎫 Member Permissions',  value: `${memberOn}/${totalMember} permissions enabled`,  inline: true  },
        { name: '🛡 Staff Permissions',   value: `${staffOn}/${totalStaff} permissions enabled`,    inline: true  },
        { name: '👁 Visibility Mode',     value: `${VISIBILITY_DEFS.find(d => d.mode === panel.visibility)?.emoji ?? ''} ${visLabel(panel.visibility)}`, inline: true },
        { name: '⚡ Claim Behaviour',     value: claimSummary,                                      inline: false },
        { name: '🔍 Validation',          value: truncate(validationSummary(v), 512),               inline: false },
      )
      .setFooter({ text: `Panel: ${panel.name}` }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('👷 Support Team',   TP.PD.team(panel.id),   ButtonStyle.Primary),
    btn('🎫 Member Perms',   TP.PD.mperms(panel.id), ButtonStyle.Secondary),
    btn('🛡 Staff Perms',    TP.PD.sperms(panel.id), ButtonStyle.Secondary),
    btn('👁 Visibility',     TP.PD.vis(panel.id),    ButtonStyle.Secondary),
    btn('⚡ Claim',          TP.PD.claim(panel.id),  ButtonStyle.Secondary),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🔍 Preview',     TP.PD.prev(panel.id), ButtonStyle.Secondary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildPDMain', payload);
  return payload;
}

// ── buildPDSupportTeam ───────────────────────────────────────────────────────

export function buildPDSupportTeam(raw: TicketPanel): CCPayload {
  const fn = 'buildPDSupportTeam';
  const panel = normalizePanel(raw);
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const embed = verifyBuilder(FILE, fn, 'team embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('👷 Support Team')
      .setDescription('Configure which roles/users can open, view, manage, and receive pings for tickets on this panel.')
      .addFields(
        { name: `👷 Support Roles (${panel.supportRoles.length})`,  value: fmtRoles(panel.supportRoles),  inline: false },
        { name: `🛠 Manager Roles (${panel.managerRoles.length})`,  value: fmtRoles(panel.managerRoles),  inline: false },
        { name: `👑 Admin Roles (${panel.adminRoles.length})`,      value: fmtRoles(panel.adminRoles),    inline: false },
        { name: `🔔 Ping Roles (${panel.pingRoles.length})`,        value: fmtRoles(panel.pingRoles),     inline: true  },
        { name: `✅ Allowed Roles (${panel.allowedRoles.length})`,  value: fmtRoles(panel.allowedRoles),  inline: true  },
        { name: `🚫 Blocked Roles (${panel.blockedRoles.length})`,  value: fmtRoles(panel.blockedRoles),  inline: true  },
        { name: `✅ Allowed Users (${panel.allowedUsers.length})`,  value: fmtUsers(panel.allowedUsers),  inline: true  },
        { name: `🚫 Blocked Users (${panel.blockedUsers.length})`,  value: fmtUsers(panel.blockedUsers),  inline: true  },
        { name: '📋 Log Channel',                                   value: panel.logChannelId ? `<#${panel.logChannelId}>` : '_Not set_', inline: true },
      )
      .setFooter({ text: 'Click a button to edit. Enter role/user IDs separated by commas.' }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Support',        TP.PD.edit(panel.id, 'support'),       ButtonStyle.Primary),
    btn('✏️ Manager',        TP.PD.edit(panel.id, 'manager'),       ButtonStyle.Primary),
    btn('✏️ Admin',          TP.PD.edit(panel.id, 'admin'),         ButtonStyle.Primary),
    btn('✏️ Ping',           TP.PD.edit(panel.id, 'ping'),          ButtonStyle.Secondary),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Allowed Roles',  TP.PD.edit(panel.id, 'allowedroles'),  ButtonStyle.Secondary),
    btn('🚫 Blocked Roles',  TP.PD.edit(panel.id, 'blockedroles'),  ButtonStyle.Secondary),
    btn('✅ Allowed Users',  TP.PD.edit(panel.id, 'allowedusers'),  ButtonStyle.Secondary),
    btn('🚫 Blocked Users',  TP.PD.edit(panel.id, 'blockedusers'),  ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📋 Log Channel',    TP.PD.edit(panel.id, 'logchannel'),    ButtonStyle.Secondary),
    backPdBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1, row2] };
  assertUniqueCustomIds('buildPDSupportTeam', payload);
  return payload;
}

// ── buildPDMemberPerms ───────────────────────────────────────────────────────

export function buildPDMemberPerms(raw: TicketPanel): CCPayload {
  const fn = 'buildPDMemberPerms';
  const panel = normalizePanel(raw);
  const cfg = panel.memberPerms;
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const enabledList = MEMBER_PERM_DEFS
    .map(d => `${cfg[d.key] ? '✅' : '❌'} ${d.emoji} ${d.label} — ${d.description}`)
    .join('\n');

  const embed = verifyBuilder(FILE, fn, 'mperms embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🎫 Member Permissions')
      .setDescription('What the ticket **opener** is allowed to do inside the ticket channel.\nClick a button to toggle a permission on/off.')
      .addFields({ name: 'Permissions', value: enabledList, inline: false })
      .setFooter({ text: `${countEnabled(cfg)}/${MEMBER_PERM_DEFS.length} permissions enabled` }),
  );

  const makePBtn = (d: MemberPermDef) =>
    btn(
      `${d.emoji} ${d.label}`,
      TP.PD.mperm(panel.id, d.key),
      cfg[d.key] ? ButtonStyle.Success : ButtonStyle.Secondary,
    );

  const defs = MEMBER_PERM_DEFS;
  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(defs.slice(0, 5).map(makePBtn));
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(defs.slice(5, 10).map(makePBtn));
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(defs.slice(10).map(makePBtn));
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(backPdBtn(panel.id), homeBtn());

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1, row2, row3] };
  assertUniqueCustomIds('buildPDMemberPerms', payload);
  return payload;
}

// ── buildPDStaffPerms ────────────────────────────────────────────────────────

export function buildPDStaffPerms(raw: TicketPanel): CCPayload {
  const fn = 'buildPDStaffPerms';
  const panel = normalizePanel(raw);
  const cfg = panel.staffPerms;
  const color = checkColor(FILE, fn, 'color', 0xed4245);

  const enabledList = STAFF_PERM_DEFS
    .map(d => `${cfg[d.key] ? '✅' : '❌'} ${d.emoji} ${d.label} — ${d.description}`)
    .join('\n');

  const embed = verifyBuilder(FILE, fn, 'sperms embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🛡 Staff Permissions')
      .setDescription('Extra Discord permissions granted to **support staff** inside the ticket channel.\nClick a button to toggle. Note: "Priority Override" is runtime-only — no Discord bit.')
      .addFields({ name: 'Permissions', value: enabledList, inline: false })
      .setFooter({ text: `${countEnabled(cfg)}/${STAFF_PERM_DEFS.length} permissions enabled` }),
  );

  const makeSBtn = (d: StaffPermDef) =>
    btn(
      `${d.emoji} ${d.label}`,
      TP.PD.sperm(panel.id, d.key),
      cfg[d.key] ? ButtonStyle.Success : ButtonStyle.Secondary,
    );

  const defs = STAFF_PERM_DEFS;
  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(defs.slice(0, 5).map(makeSBtn));
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(defs.slice(5).map(makeSBtn));
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(backPdBtn(panel.id), homeBtn());

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1, row2] };
  assertUniqueCustomIds('buildPDStaffPerms', payload);
  return payload;
}

// ── buildPDVisibility ────────────────────────────────────────────────────────

export function buildPDVisibility(raw: TicketPanel): CCPayload {
  const fn = 'buildPDVisibility';
  const panel = normalizePanel(raw);
  const current = panel.visibility;
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const descriptions = VISIBILITY_DEFS
    .map(d => `${d.mode === current ? '▶' : '  '} **${d.emoji} ${d.label}** — ${d.description}`)
    .join('\n');

  const currentDef = VISIBILITY_DEFS.find(d => d.mode === current);

  const embed = verifyBuilder(FILE, fn, 'vis embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('👁 Visibility Mode')
      .setDescription('Controls who can see the ticket channel that is created when someone opens a ticket.')
      .addFields(
        { name: 'Modes',         value: descriptions,                      inline: false },
        { name: 'Current Mode',  value: `${currentDef?.emoji ?? ''} **${visLabel(current)}**`, inline: false },
      )
      .setFooter({ text: 'Click a mode to activate it. Currently active mode is highlighted in blue.' }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    VISIBILITY_DEFS.map(d =>
      btn(
        `${d.emoji} ${d.label}`,
        TP.PD.setvis(panel.id, d.mode),
        d.mode === current ? ButtonStyle.Primary : ButtonStyle.Secondary,
      ),
    ),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(backPdBtn(panel.id), homeBtn());

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildPDVisibility', payload);
  return payload;
}

// ── buildPDClaim ─────────────────────────────────────────────────────────────

export function buildPDClaim(raw: TicketPanel): CCPayload {
  const fn = 'buildPDClaim';
  const panel = normalizePanel(raw);
  const c = panel.claimBehaviour;
  const color = checkColor(FILE, fn, 'color', 0xfee75c);

  const claimFields: Array<{ key: keyof TicketClaimBehaviourConfig; emoji: string; label: string; description: string }> = [
    { key: 'hideFromOtherStaffOnClaim', emoji: '🙈', label: 'Hide on Claim',   description: 'Remove other staff view access when a ticket is claimed' },
    { key: 'keepVisible',               emoji: '👁',  label: 'Keep Visible',   description: 'Other staff can still see the ticket after it is claimed' },
    { key: 'managerOverride',           emoji: '🛠',  label: 'Mgr Override',   description: 'Managers can always access claimed tickets regardless of hide setting' },
    { key: 'adminOverride',             emoji: '👑',  label: 'Admin Override', description: 'Admins can always access claimed tickets regardless of hide setting' },
  ];

  const claimList = claimFields
    .map(f => `${c[f.key] ? '✅' : '❌'} ${f.emoji} **${f.label}** — ${f.description}`)
    .join('\n');

  const embed = verifyBuilder(FILE, fn, 'claim embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('⚡ Claim Behaviour')
      .setDescription('Controls what happens to channel permissions when a staff member **claims** a ticket.')
      .addFields({ name: 'Settings', value: claimList, inline: false })
      .setFooter({ text: 'Click a button to toggle. Runtime enforcement requires TicketEngine claim integration.' }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    claimFields.map(f =>
      btn(
        `${f.emoji} ${f.label}`,
        TP.PD.ctog(panel.id, f.key),
        c[f.key] ? ButtonStyle.Success : ButtonStyle.Secondary,
      ),
    ),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(backPdBtn(panel.id), homeBtn());

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildPDClaim', payload);
  return payload;
}

// ── buildPDPreview ───────────────────────────────────────────────────────────

export function buildPDPreview(raw: TicketPanel): CCPayload {
  const fn = 'buildPDPreview';
  const panel = normalizePanel(raw);
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  function permLine(key: keyof TicketMemberPermConfig, cfg: TicketMemberPermConfig, def: MemberPermDef): string {
    return `${cfg[key] ? '✅' : '❌'} ${def.emoji} ${def.label}`;
  }

  const openerPerms = MEMBER_PERM_DEFS.map(d => permLine(d.key, panel.memberPerms, d)).join('\n');

  const staffBasePerms = [
    '✅ 👁 View Channel',
    '✅ 💬 Send Messages',
    '✅ 📜 Msg History',
    ...STAFF_PERM_DEFS.filter(d => panel.staffPerms[d.key] && d.key !== 'priorityOverride').map(d => `✅ ${d.emoji} ${d.label}`),
  ].join('\n');

  const managerPerms = staffBasePerms + '\n✅ 📁 Manage Channels\n✅ 🗂 Manage Messages (base)';
  const adminPerms   = managerPerms   + '\n✅ 🔐 Manage Permissions';

  const everyoneValue = (() => {
    switch (panel.visibility) {
      case 'public':         return '✅ 👁 View Channel\n✅ 📜 Msg History\n❌ 💬 Send Messages';
      case 'shared_support': return '✅ 👁 View Channel\n❌ 📜 Msg History\n❌ 💬 Send Messages';
      default:               return '❌ 👁 View Channel (private)';
    }
  })();

  const blockedValue = [
    panel.blockedRoles.length > 0 ? `${panel.blockedRoles.length} role(s): cannot open tickets` : null,
    panel.blockedUsers.length > 0 ? `${panel.blockedUsers.length} user(s): cannot open tickets` : null,
  ].filter(Boolean).join('\n') || '_None configured_';

  const allowedValue = [
    panel.allowedRoles.length > 0 || panel.allowedUsers.length > 0
      ? `Only ${panel.allowedRoles.length} role(s) / ${panel.allowedUsers.length} user(s) may open tickets`
      : '_Everyone may open tickets (no restrictions)_',
  ].join('');

  const v = validatePanelPerms(panel);

  const embed = verifyBuilder(FILE, fn, 'preview embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🔍 Permission Preview')
      .setDescription('Computed preview of what each role type will receive when a ticket is opened. Actual Discord overwrites are applied by the Permission Engine.')
      .addFields(
        { name: '🌐 @everyone',         value: truncate(everyoneValue,   512), inline: false },
        { name: '🎫 Ticket Opener',      value: truncate(openerPerms,     512), inline: false },
        { name: '👷 Support Roles',      value: truncate(staffBasePerms,  512), inline: true  },
        { name: '🛠 Manager Roles',      value: truncate(managerPerms,    512), inline: true  },
        { name: '👑 Admin Roles',        value: truncate(adminPerms,      512), inline: false },
        { name: '✅ Allowed',            value: truncate(allowedValue,    512), inline: true  },
        { name: '🚫 Blocked',            value: truncate(blockedValue,    512), inline: true  },
        { name: '🔍 Validation',         value: truncate(validationSummary(v), 512), inline: false },
      )
      .setFooter({ text: 'This is a static preview — exact bits are computed at ticket-open time.' }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(backPdBtn(panel.id), homeBtn());

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0] };
  assertUniqueCustomIds('buildPDPreview', payload);
  return payload;
}

// ── Modal builders ───────────────────────────────────────────────────────────

/** Returns the correct edit modal for a given PD section key. */
export function buildPDEditModal(panel: TicketPanel, section: string): ModalBuilder | null {
  const p = normalizePanel(panel);
  const id = TP.PD.pdModal(p.id, section);

  switch (section) {
    case 'support':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Support Roles')
        .addComponents(
          mrow(ti('supportRoles', 'Support Role IDs (comma-separated)',
            TextInputStyle.Paragraph, p.supportRoles.join(', '),
            'Role IDs. E.g. 123456789012345678, 987654321098765432', false, 2000)),
        );

    case 'manager':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Manager Roles')
        .addComponents(
          mrow(ti('managerRoles', 'Manager Role IDs (comma-separated)',
            TextInputStyle.Paragraph, p.managerRoles.join(', '),
            'Role IDs. Managers can manage channels & messages.', false, 2000)),
        );

    case 'admin':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Admin Roles')
        .addComponents(
          mrow(ti('adminRoles', 'Admin Role IDs (comma-separated)',
            TextInputStyle.Paragraph, p.adminRoles.join(', '),
            'Role IDs. Admins get Manage Permissions on top of Manager perms.', false, 2000)),
        );

    case 'ping':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Ping Roles')
        .addComponents(
          mrow(ti('pingRoles', 'Ping Role IDs (comma-separated)',
            TextInputStyle.Paragraph, p.pingRoles.join(', '),
            'Role IDs pinged in the ticket when it is opened.', false, 2000)),
        );

    case 'allowedroles':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Allowed Roles')
        .addComponents(
          mrow(ti('allowedRoles', 'Allowed Role IDs (comma-separated)',
            TextInputStyle.Paragraph, p.allowedRoles.join(', '),
            'Only these roles can open tickets. Leave empty = everyone can open.', false, 2000)),
        );

    case 'blockedroles':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Blocked Roles')
        .addComponents(
          mrow(ti('blockedRoles', 'Blocked Role IDs (comma-separated)',
            TextInputStyle.Paragraph, p.blockedRoles.join(', '),
            'These roles cannot open tickets on this panel.', false, 2000)),
        );

    case 'allowedusers':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Allowed Users')
        .addComponents(
          mrow(ti('allowedUsers', 'Allowed User IDs (comma-separated)',
            TextInputStyle.Paragraph, p.allowedUsers.join(', '),
            'Only these users can open tickets (combined with Allowed Roles).', false, 2000)),
        );

    case 'blockedusers':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Blocked Users')
        .addComponents(
          mrow(ti('blockedUsers', 'Blocked User IDs (comma-separated)',
            TextInputStyle.Paragraph, p.blockedUsers.join(', '),
            'These users cannot open tickets on this panel.', false, 2000)),
        );

    case 'logchannel':
      return new ModalBuilder()
        .setCustomId(id)
        .setTitle('Log Channel')
        .addComponents(
          mrow(ti('logChannelId', 'Log Channel ID',
            TextInputStyle.Short, p.logChannelId ?? '',
            'Channel where open/close/claim actions are logged.', false, 20)),
        );

    default:
      return null;
  }
}
