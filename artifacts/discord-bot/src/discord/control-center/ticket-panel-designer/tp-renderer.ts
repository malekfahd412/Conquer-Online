import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { TicketPanel, TicketTemplate, TicketButtonConfig, TicketSelectMenuOption, TicketForm, FormQuestion, QuestionType, TicketEntryRef } from '../../../community/tickets/types';
import { QUESTION_TYPE_META, QUESTION_TYPES, getEntry, entryLabel, resolveTicketType, parseEntryRef, DEFAULT_MEMBER_PERMS, DEFAULT_STAFF_PERMS, DEFAULT_CLAIM_BEHAVIOUR } from '../../../community/tickets/types';
import { FORM_TEMPLATES } from '../../../community/tickets/form-templates';
import { buildPDMain } from './tp-permission-designer';
import type { TicketDashboard } from '../../../community/tickets/statistics-engine';
import { truncate } from '../cc-categories';
import { CC } from '../cc-ids';
import { checkColor, verifyBuilder, assertUniqueCustomIds } from '../cc-debug';
import { TP, SECTION_META } from './tp-ids';
import type { CCPayload } from '../cc-renderer';

const FILE = 'tp-renderer.ts';
export const PANELS_PER_PAGE    = 10;
export const TEMPLATES_PER_PAGE = 20;

// ── Shared button helpers ───────────────────────────────────────────────────

function btn(label: string, id: string, style: ButtonStyle, disabled = false): ButtonBuilder {
  return verifyBuilder(FILE, 'btn', `btn:${id}`, () =>
    new ButtonBuilder().setLabel(truncate(label, 80)).setCustomId(id).setStyle(style).setDisabled(disabled),
  );
}

function homeBtn(): ButtonBuilder  { return btn('🏠 Home',     CC.HOME,     ButtonStyle.Secondary); }
function listBtn(): ButtonBuilder   { return btn('← Panels',   TP.LIST,     ButtonStyle.Secondary); }
function dashBtn(id: string): ButtonBuilder { return btn('← Dashboard', TP.dash(id), ButtonStyle.Secondary); }

function fmtColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

function fmtMs(ms: number): string {
  if (ms <= 0) return 'N/A';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

// ── Panel List ──────────────────────────────────────────────────────────────

export function buildPanelList(panels: TicketPanel[], offset: number, totalCount: number): CCPayload {
  const fn = 'buildPanelList';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const page = Math.floor(offset / PANELS_PER_PAGE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PANELS_PER_PAGE));
  const slice = panels.slice(0, PANELS_PER_PAGE);

  const desc = totalCount === 0
    ? 'No ticket panels configured yet.\nClick **➕ Create New Panel** to get started.'
    : `${totalCount} panel${totalCount !== 1 ? 's' : ''} — Page ${page}/${totalPages}\nSelect a panel below to configure it.`;

  const embed = verifyBuilder(FILE, fn, 'list embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🎨 Ticket Panel Designer')
      .setDescription(desc)
      .setFooter({ text: 'Panels are the messages users click to open tickets' }),
  );

  const components: CCPayload['components'] = [];

  if (slice.length > 0) {
    const select = verifyBuilder(FILE, fn, 'panel select', () =>
      new StringSelectMenuBuilder()
        .setCustomId(TP.panelSelect(offset))
        .setPlaceholder('Select a panel to configure...')
        .addOptions(
          slice.map(p =>
            new StringSelectMenuOptionBuilder()
              .setLabel(truncate(p.name || 'Unnamed Panel', 100))
              .setDescription(truncate(`${p.enabled ? '🟢 Enabled' : '🔴 Disabled'} · ${p.description || 'No description'}`, 100))
              .setValue(p.id),
          ),
        ),
    );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const prevOffset = offset - PANELS_PER_PAGE;
  const nextOffset = offset + PANELS_PER_PAGE;
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('➕ Create New Panel', TP.NEW,              ButtonStyle.Primary),
    btn('📋 Templates',       TP.GALLERY,           ButtonStyle.Secondary),
    btn('◀ Prev',             TP.list(prevOffset),  ButtonStyle.Secondary, offset === 0),
    btn('▶ Next',             TP.list(nextOffset),  ButtonStyle.Secondary, nextOffset >= totalCount),
    homeBtn(),
  );
  components.push(navRow);

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildPanelList', payload);
  return payload;
}

// ── Panel Dashboard ─────────────────────────────────────────────────────────

export function buildPanelDashboard(panel: TicketPanel): CCPayload {
  const fn = 'buildPanelDashboard';
  const color = checkColor(FILE, fn, 'color', 0xfee75c);

  const channelStatus = panel.channelId
    ? panel.messageId ? `<#${panel.channelId}> (published)` : `<#${panel.channelId}> (not published)`
    : 'No channel set';

  const embed = verifyBuilder(FILE, fn, 'dash embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`🎨 ${truncate(panel.name, 100)}`)
      .setDescription(truncate(panel.description || 'No description set.', 1000))
      .addFields(
        { name: '📡 Status',   value: panel.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
        { name: '📍 Channel',  value: channelStatus,                                  inline: true },
        { name: '🎟 Naming',   value: `\`${panel.namingScheme}\``,                   inline: true },
        { name: '🔘 Opener',   value: panel.selectMenu ? '📋 Select Menu' : `🔘 Button: ${panel.button.label}`, inline: true },
        { name: '❓ Questions', value: panel.modal.enabled ? `${panel.modal.questions.length} question(s)` : 'Disabled', inline: true },
        { name: '🤖 Auto-close', value: panel.automation.autoCloseInactivityMinutes > 0 ? `${panel.automation.autoCloseInactivityMinutes}m` : 'Off', inline: true },
      )
      .setFooter({ text: `Panel ID: ${panel.id}` }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(`${SECTION_META.general.emoji} General`,      TP.section(panel.id, 'general'),      ButtonStyle.Secondary),
    btn(`${SECTION_META.appearance.emoji} Appearance`, TP.section(panel.id, 'appearance'),  ButtonStyle.Secondary),
    btn(`${SECTION_META.button.emoji} Button`,        TP.section(panel.id, 'button'),       ButtonStyle.Secondary),
    btn(`${SECTION_META.permissions.emoji} Permissions`, TP.section(panel.id, 'permissions'), ButtonStyle.Secondary),
    btn(`${SECTION_META.forms.emoji} Forms`,           TP.section(panel.id, 'forms'),         ButtonStyle.Secondary),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(`${SECTION_META.categories.emoji} Categories`, TP.section(panel.id, 'categories'),  ButtonStyle.Secondary),
    btn(`${SECTION_META.naming.emoji} Naming`,        TP.section(panel.id, 'naming'),       ButtonStyle.Secondary),
    btn(`${SECTION_META.lifecycle.emoji} Lifecycle`,  TP.section(panel.id, 'lifecycle'),    ButtonStyle.Secondary),
    btn(`${SECTION_META.automation.emoji} Automation`, TP.section(panel.id, 'automation'),  ButtonStyle.Secondary),
    btn(`${SECTION_META.transcripts.emoji} Transcripts`, TP.section(panel.id, 'transcripts'), ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('👁 Preview',                                  TP.preview(panel.id),                 ButtonStyle.Secondary),
    btn(`${SECTION_META.publish.emoji} Publish`,       TP.section(panel.id, 'publish'),      ButtonStyle.Success),
    btn(`${SECTION_META.stats.emoji} Statistics`,     TP.section(panel.id, 'stats'),        ButtonStyle.Secondary),
    btn(panel.enabled ? '🔴 Disable' : '🟢 Enable',   TP.toggle(panel.id, 'enabled'),       panel.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    btn('🗑 Delete',                                   TP.del(panel.id),                     ButtonStyle.Danger),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('💾 Save as Template', TP.tplSave(panel.id), ButtonStyle.Secondary),
    btn('⭐ Reviews',           TP.RV.main(panel.id),  ButtonStyle.Secondary),
    listBtn(),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1, row2, row3] };
  assertUniqueCustomIds('buildPanelDashboard', payload);
  return payload;
}

// ── General Section ─────────────────────────────────────────────────────────

export function buildGeneralSection(panel: TicketPanel): CCPayload {
  const fn = 'buildGeneralSection';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const embed = verifyBuilder(FILE, fn, 'general embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('⚙️ General')
      .addFields(
        { name: 'Panel Name',   value: truncate(panel.name || '_(not set)_', 256),                   inline: false },
        { name: 'Description',  value: truncate(panel.description || '_(not set)_', 512),             inline: false },
        { name: 'Enabled',      value: panel.enabled ? '🟢 Yes' : '🔴 No',                           inline: true  },
      )
      .setFooter({ text: 'Click Edit to update all general fields at once' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Info',              TP.edit(panel.id, 'general'),       ButtonStyle.Primary),
    btn(panel.enabled ? '🔴 Disable' : '🟢 Enable', TP.toggle(panel.id, 'enabled'), panel.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildGeneralSection', payload);
  return payload;
}

// ── Appearance Section ──────────────────────────────────────────────────────

const EMBED_VARS_HELP = '{user} · {server} · {membercount} · {date} · {ticket}';

export function buildAppearanceSection(panel: TicketPanel): CCPayload {
  const fn = 'buildAppearanceSection';
  const safeColor = checkColor(FILE, fn, 'panelColor', panel.embed.color);

  const embed = verifyBuilder(FILE, fn, 'appearance embed', () =>
    new EmbedBuilder()
      .setColor(safeColor)
      .setTitle('🎨 Appearance')
      .addFields(
        { name: 'Embed Title',       value: truncate(panel.embed.title || '_(not set)_', 256),       inline: false },
        { name: 'Embed Color',       value: fmtColor(panel.embed.color),                              inline: true  },
        { name: 'Footer',            value: truncate(panel.embed.footer || '_(none)_', 256),          inline: true  },
        { name: 'Thumbnail URL',     value: truncate(panel.embed.thumbnail || '_(none)_', 256),       inline: false },
        { name: 'Image/Banner URL',  value: truncate(panel.embed.banner || '_(none)_', 256),          inline: false },
        { name: 'Message Content',    value: truncate(panel.embed.messageContent || '_(none)_', 256), inline: true  },
        { name: 'Timestamp',         value: panel.embed.showTimestamp ? '🟢 On' : '🔴 Off',          inline: true  },
        { name: '📋 Available Variables', value: EMBED_VARS_HELP,                                    inline: false },
      )
      .setFooter({ text: 'Description is set separately via Edit Embed' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Embed',      TP.edit(panel.id, 'embed'),       ButtonStyle.Primary),
    btn('🖼 Edit Media',      TP.edit(panel.id, 'media'),       ButtonStyle.Secondary),
    btn(panel.embed.showTimestamp ? '🕑 Hide Time' : '🕑 Show Time', TP.toggle(panel.id, 'timestamp'), ButtonStyle.Secondary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildAppearanceSection', payload);
  return payload;
}

// ── Button Section ──────────────────────────────────────────────────────────

export function buildButtonSection(panel: TicketPanel): CCPayload {
  const fn = 'buildButtonSection';
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const isSmMode = !!(panel.selectMenu && panel.selectMenu.options.length > 0) || !!(panel.selectMenu);
  const extras = panel.additionalButtons;

  const primaryLine = `Label: **${panel.button.label}** · Style: ${panel.button.style}${panel.button.emoji ? ` · ${panel.button.emoji}` : ''} · Type: \`${panel.button.ticketType}\`${panel.button.overrides ? ` · 🏷️ ${Object.keys(panel.button.overrides).length} override(s)` : ''}`;
  const extrasText = extras.length === 0
    ? '_No extra buttons_'
    : extras.map((b, i) => `${i + 1}. **${b.label}** (${b.style}) · Type: \`${b.ticketType}\`${b.overrides ? ` · 🏷️ ${Object.keys(b.overrides).length} override(s)` : ''}`).join('\n');

  const smText = isSmMode && panel.selectMenu
    ? `${panel.selectMenu.options.length} option(s) configured\nPlaceholder: ${panel.selectMenu.placeholder || '_(default)_'}`
    : '_Disabled — using buttons_';

  const embed = verifyBuilder(FILE, fn, 'button embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🔘 Button & Select Menu Designer')
      .addFields(
        { name: '🔘 Primary Button',    value: primaryLine,                    inline: false },
        { name: '➕ Extra Buttons',     value: truncate(extrasText, 512),       inline: false },
        { name: '📋 Select Menu Mode',  value: truncate(smText, 256),           inline: false },
      )
      .setFooter({ text: 'A panel can use buttons OR a select menu — not both' }),
  );

  const components: CCPayload['components'] = [];

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Primary Button',    TP.btnPrimary(panel.id),                ButtonStyle.Primary),
    btn('🏷️ Primary Type Settings', TP.TT.main(panel.id, 'b'),          ButtonStyle.Secondary),
    btn('➕ Add Button',        TP.btnAdd(panel.id),                    ButtonStyle.Secondary, extras.length >= 4),
    btn(isSmMode ? '🔘 Use Buttons' : '📋 Use Select Menu', TP.toggle(panel.id, 'selectmenu'), ButtonStyle.Secondary),
    dashBtn(panel.id),
  );
  components.push(row0);
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn()));

  if (isSmMode && panel.selectMenu) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('➕ Add Option',      TP.smAdd(panel.id),    ButtonStyle.Secondary, (panel.selectMenu.options.length) >= 25),
      btn('✏️ Edit Placeholder', TP.edit(panel.id, 'smplaceholder'), ButtonStyle.Secondary),
    ));
    if (panel.selectMenu.options.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(TP.smOptSel(panel.id))
        .setPlaceholder('Select an option to edit or remove...')
        .addOptions(
          panel.selectMenu.options.slice(0, 25).map((o, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(truncate(o.label, 100))
              .setDescription(truncate(`Type: ${o.ticketType}${o.overrides ? ` · 🏷️ ${Object.keys(o.overrides).length} override(s)` : ''}${o.description ? ` — ${o.description}` : ''}`, 100))
              .setValue(String(i)),
          ),
        );
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    }
  } else if (!isSmMode && extras.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(TP.extraBtnSel(panel.id))
      .setPlaceholder('Select an extra button to edit or remove...')
      .addOptions(
        extras.slice(0, 25).map((b, i) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(truncate(b.label, 100))
            .setDescription(truncate(`Style: ${b.style} · Type: ${b.ticketType}${b.overrides ? ` · 🏷️ ${Object.keys(b.overrides).length} override(s)` : ''}`, 100))
            .setValue(String(i)),
        ),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildButtonSection', payload);
  return payload;
}

// ── Extra Button Detail ─────────────────────────────────────────────────────

export function buildExtraButtonDetail(panel: TicketPanel, idx: number): CCPayload {
  const fn = 'buildExtraButtonDetail';
  const btn_ = panel.additionalButtons[idx];
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const embed = verifyBuilder(FILE, fn, 'btn detail embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`🔘 Extra Button #${idx + 1}`)
      .addFields(
        { name: 'Label',      value: btn_?.label || '_(missing)_',     inline: true },
        { name: 'Style',      value: btn_?.style || '_(missing)_',     inline: true },
        { name: 'Emoji',      value: btn_?.emoji || '_(none)_',        inline: true },
        { name: 'Ticket Type', value: `\`${btn_?.ticketType || 'default'}\``, inline: true },
        { name: '🏷️ Type Overrides', value: btn_?.overrides ? `${Object.keys(btn_.overrides).length} field(s) overridden` : '_None — inherits panel defaults_', inline: true },
      ),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit',              TP.btnEdit(panel.id, idx),                 ButtonStyle.Primary),
    btn('🏷️ Ticket Type Settings', TP.TT.main(panel.id, `x${idx}`),        ButtonStyle.Secondary),
    btn('🗑 Remove',            TP.btnRm(panel.id, idx),                   ButtonStyle.Danger),
    btn('← Buttons',            TP.section(panel.id, 'button'),            ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildExtraButtonDetail', payload);
  return payload;
}

// ── Select Menu Option Detail ───────────────────────────────────────────────

export function buildSmOptionDetail(panel: TicketPanel, idx: number): CCPayload {
  const fn = 'buildSmOptionDetail';
  const opt = panel.selectMenu?.options[idx];
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const embed = verifyBuilder(FILE, fn, 'sm opt embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`📋 Select Menu Option #${idx + 1}`)
      .addFields(
        { name: 'Label',       value: opt?.label || '_(missing)_',       inline: true },
        { name: 'Emoji',       value: opt?.emoji || '_(none)_',          inline: true },
        { name: 'Ticket Type', value: `\`${opt?.ticketType || 'default'}\``, inline: true },
        { name: 'Description', value: opt?.description || '_(none)_',   inline: false },
        { name: '🏷️ Type Overrides', value: opt?.overrides ? `${Object.keys(opt.overrides).length} field(s) overridden` : '_None — inherits panel defaults_', inline: true },
      ),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit',              TP.smEdit(panel.id, idx),                  ButtonStyle.Primary),
    btn('🏷️ Ticket Type Settings', TP.TT.main(panel.id, `s${idx}`),        ButtonStyle.Secondary),
    btn('🗑 Remove',            TP.smRm(panel.id, idx),                    ButtonStyle.Danger),
    btn('← Button',             TP.section(panel.id, 'button'),            ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildSmOptionDetail', payload);
  return payload;
}

// ── Ticket Type Designer (main hub) ─────────────────────────────────────────

/** Where the "← Back" button on the Ticket Type Settings hub should return to, based on which entry it was opened from. */
function ttBackButtonId(panel: TicketPanel, ref: TicketEntryRef): string {
  const { kind, idx } = parseEntryRef(ref);
  if (kind === 'b') return TP.section(panel.id, 'button');
  if (kind === 'x') return TP.btnDetail(panel.id, idx);
  return TP.smOpt(panel.id, idx);
}

/** Shared "this button/option no longer exists" screen for every Ticket Type Designer page. */
function buildTTMissingEntry(panel: TicketPanel, fnName: string): CCPayload {
  const embed = verifyBuilder(FILE, fnName, 'tt missing entry embed', () =>
    new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ Ticket Type Settings')
      .setDescription('This button/option no longer exists on this panel — it may have been removed.'),
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('← Panel',  TP.dash(panel.id), ButtonStyle.Secondary),
    homeBtn(),
  );
  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds(`${fnName}:missing`, payload);
  return payload;
}

/** `<#id>` if set as an override, `<#id> (inherited)` if only the panel default applies, else "Not set". */
function overrideCategoryLine(overrideVal: string | undefined, resolvedVal: string | undefined): string {
  if (overrideVal) return `<#${overrideVal}> _(override)_`;
  if (resolvedVal) return `<#${resolvedVal}> _(inherited from panel)_`;
  return '_Not set_';
}

/** Renders a role-ID list for the Ticket Type roles page, distinguishing an explicit (possibly empty) override from inherited panel roles. */
function overrideRoleLine(overrideVal: string[] | undefined, resolvedVal: string[]): string {
  if (overrideVal !== undefined) {
    return overrideVal.length > 0 ? `${truncate(overrideVal.map(r => `<@&${r}>`).join(', '), 900)} _(override)_` : '_(override: none)_';
  }
  return resolvedVal.length > 0 ? `${truncate(resolvedVal.map(r => `<@&${r}>`).join(', '), 900)} _(inherited from panel)_` : '_Not set_';
}

/** Fills in every ticket-naming placeholder with sample values for a live preview. Shared by the panel-level and ticket-type-level naming pages. */
function renderNamingPreview(scheme: string): string {
  return (scheme
    .replace('{user}', 'johndoe')
    .replace('{username}', 'johndoe')
    .replace('{userid}', '123456789')
    .replace('{displayname}', 'John Doe')
    .replace('{ticket}', 'panel_abc12')
    .replace('{counter}', '0042')
    .replace('{number}', '0042')
    .replace('{date}', '2026-07-11')
    .replace('{time}', '14-30')
    .replace('{year}', '2026')
    .replace('{month}', '07')
    .replace('{day}', '11')
    .replace('{random}', 'x7k2m')
    .replace('{type}', 'support')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 90)) || 'ticket';
}

export function buildTTMain(panel: TicketPanel, ref: TicketEntryRef): CCPayload {
  const fn = 'buildTTMain';
  const color = checkColor(FILE, fn, 'color', 0xfee75c);
  const entry = getEntry(panel, ref);

  if (!entry) return buildTTMissingEntry(panel, fn);

  const cfg = resolveTicketType(panel, entry.ticketType);
  const overrideCount = entry.overrides ? Object.keys(entry.overrides).length : 0;

  // `resolveTicketType()` does not normalize the panel — every override object it
  // returns is still optional (older panels predate the Permission Designer fields).
  // Never read cfg.memberPerms / cfg.staffPerms / cfg.visibility / cfg.claimBehaviour
  // directly; merge with defaults first so a legacy/un-normalized panel can't crash the render.
  const memberPerms    = { ...DEFAULT_MEMBER_PERMS, ...(cfg.memberPerms ?? {}) };
  const staffPerms     = { ...DEFAULT_STAFF_PERMS, ...(cfg.staffPerms ?? {}) };
  const visibility     = cfg.visibility ?? 'private';
  const claimBehaviour = { ...DEFAULT_CLAIM_BEHAVIOUR, ...(cfg.claimBehaviour ?? {}) };
  const adminRoles     = cfg.adminRoles ?? [];

  const embed = verifyBuilder(FILE, fn, 'tt main embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`🏷️ Ticket Type Settings — ${entryLabel(panel, ref)}`)
      .setDescription(`Ticket type key: \`${entry.ticketType}\`\n${overrideCount > 0 ? `🏷️ **${overrideCount} field(s)** overridden for this type.` : '_No overrides set — this type currently inherits every panel default._'}`)
      .addFields(
        { name: '📁 Open / Closed / Archive', value: `${cfg.openCategory ? `<#${cfg.openCategory}>` : '_(none)_'} → ${cfg.closedCategory ? `<#${cfg.closedCategory}>` : '_(none)_'} → ${cfg.archiveCategory ? `<#${cfg.archiveCategory}>` : '_(none)_'}`, inline: false },
        { name: '👥 Support / Manager / Admin roles', value: `${cfg.supportRoles.length} / ${cfg.managerRoles.length} / ${adminRoles.length}`, inline: true },
        { name: '🎯 Priority', value: cfg.priority, inline: true },
        { name: '🔒 Visibility', value: visibility, inline: true },
        { name: '🎫 Ticket Limit', value: String(cfg.ticketLimit), inline: true },
        { name: '⏱ Cooldown', value: `${cfg.cooldown}s`, inline: true },
        { name: '🙈 Hide on Claim', value: claimBehaviour.hideFromOtherStaffOnClaim ? 'Enabled' : 'Disabled', inline: true },
        { name: '📄 Transcript', value: cfg.transcript.enabled ? 'Enabled' : 'Disabled', inline: true },
        { name: '👤 Member Perms (View/Send)', value: `${memberPerms.viewChannel ? '✅' : '❌'} / ${memberPerms.sendMessages ? '✅' : '❌'}`, inline: true },
        { name: '🛠 Staff Perms (Manage Msgs)', value: staffPerms.manageMessages ? '✅' : '❌', inline: true },
      )
      .setFooter({ text: 'Pick a category below to edit that setting for just this button/option.' }),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📁 Categories',     TP.TT.cat(panel.id, ref),   ButtonStyle.Secondary),
    btn('👥 Roles',          TP.TT.roles(panel.id, ref), ButtonStyle.Secondary),
    btn('📝 Naming',         TP.TT.naming(panel.id, ref), ButtonStyle.Secondary),
    btn('🖼️ Welcome Embed', TP.TT.embed(panel.id, ref), ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🗑 Clear All Overrides', TP.TT.reset(panel.id, ref, 'all'), ButtonStyle.Danger, overrideCount === 0),
    btn('← Back',                 ttBackButtonId(panel, ref),        ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row1, row2] };
  assertUniqueCustomIds('buildTTMain', payload);
  return payload;
}

// ── Ticket Type Designer — Categories page ──────────────────────────────────

export function buildTTCategories(panel: TicketPanel, ref: TicketEntryRef): CCPayload {
  const fn = 'buildTTCategories';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const entry = getEntry(panel, ref);
  if (!entry) return buildTTMissingEntry(panel, fn);

  const o = entry.overrides ?? {};
  const cfg = resolveTicketType(panel, entry.ticketType);
  const hasOverride = o.openCategory !== undefined || o.closedCategory !== undefined || o.archiveCategory !== undefined;

  const embed = verifyBuilder(FILE, fn, 'tt categories embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`📁 Category Routing — ${entryLabel(panel, ref)}`)
      .addFields(
        { name: '📂 Open Category',    value: overrideCategoryLine(o.openCategory,    cfg.openCategory),    inline: true },
        { name: '🔒 Closed Category',  value: overrideCategoryLine(o.closedCategory,  cfg.closedCategory),  inline: true },
        { name: '🗄 Archive Category', value: overrideCategoryLine(o.archiveCategory, cfg.archiveCategory), inline: true },
      )
      .setFooter({ text: 'Enter category channel IDs. Leave a field blank in the editor to inherit the panel default for that category.' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Categories',        TP.TT.edit(panel.id, ref, 'cat'),  ButtonStyle.Primary),
    btn('↩️ Reset to Panel Default', TP.TT.reset(panel.id, ref, 'cat'), ButtonStyle.Secondary, !hasOverride),
    btn('← Back',                    TP.TT.main(panel.id, ref),         ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildTTCategories', payload);
  return payload;
}

// ── Ticket Type Designer — Roles page ───────────────────────────────────────

export function buildTTRoles(panel: TicketPanel, ref: TicketEntryRef): CCPayload {
  const fn = 'buildTTRoles';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const entry = getEntry(panel, ref);
  if (!entry) return buildTTMissingEntry(panel, fn);

  const o = entry.overrides ?? {};
  const cfg = resolveTicketType(panel, entry.ticketType);
  const hasOverride = o.supportRoles !== undefined || o.pingRoles !== undefined;

  const embed = verifyBuilder(FILE, fn, 'tt roles embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`👥 Roles — ${entryLabel(panel, ref)}`)
      .addFields(
        { name: '🛟 Support Roles', value: overrideRoleLine(o.supportRoles, cfg.supportRoles), inline: false },
        { name: '📣 Ping Roles',    value: overrideRoleLine(o.pingRoles,    cfg.pingRoles),     inline: false },
      )
      .setFooter({ text: 'Comma-separated role IDs. Leave a field blank in the editor to inherit the panel default.' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Roles',             TP.TT.edit(panel.id, ref, 'roles'),  ButtonStyle.Primary),
    btn('↩️ Reset to Panel Default', TP.TT.reset(panel.id, ref, 'roles'), ButtonStyle.Secondary, !hasOverride),
    btn('← Back',                    TP.TT.main(panel.id, ref),           ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildTTRoles', payload);
  return payload;
}

// ── Ticket Type Designer — Naming page ──────────────────────────────────────

export function buildTTNaming(panel: TicketPanel, ref: TicketEntryRef): CCPayload {
  const fn = 'buildTTNaming';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const entry = getEntry(panel, ref);
  if (!entry) return buildTTMissingEntry(panel, fn);

  const o = entry.overrides ?? {};
  const cfg = resolveTicketType(panel, entry.ticketType);
  const preview = renderNamingPreview(cfg.namingScheme);

  const embed = verifyBuilder(FILE, fn, 'tt naming embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`📝 Ticket Naming — ${entryLabel(panel, ref)}`)
      .addFields(
        { name: 'Effective Scheme', value: `\`${cfg.namingScheme}\` ${o.namingScheme !== undefined ? '_(override)_' : '_(default: from button label)_'}`, inline: false },
        { name: '👁 Live Preview',  value: `\`${preview}\``, inline: false },
        { name: '📋 Variables',     value: [
          '`{user}` / `{username}` — opener\'s username',
          '`{userid}` — opener\'s Discord ID',
          '`{displayname}` — opener\'s display name',
          '`{counter}` / `{number}` — 4-digit ticket counter',
          '`{date}` — YYYY-MM-DD · `{time}` — HH-MM',
          '`{year}` · `{month}` · `{day}`',
          '`{random}` — 5-char random token',
          '`{type}` — ticket type from the button/menu',
        ].join('\n'),                                                     inline: false },
      )
      .setFooter({ text: 'Channel names are lowercase, max 90 chars, dashes only. Leave the field blank in the editor to auto-generate from this button\'s label.' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Scheme',            TP.TT.edit(panel.id, ref, 'naming'),  ButtonStyle.Primary),
    btn('↩️ Reset to Panel Default', TP.TT.reset(panel.id, ref, 'naming'), ButtonStyle.Secondary, o.namingScheme === undefined),
    btn('← Back',                    TP.TT.main(panel.id, ref),            ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildTTNaming', payload);
  return payload;
}

// ── Ticket Type Designer — Welcome Embed page ───────────────────────────────

/** `undefined` → not overridden, so the page can show "inherits default" for that field alone. */
function ttEmbedLine(value: string | undefined, fallbackLabel: string): string {
  return value ? truncate(value, 200) : `_(${fallbackLabel})_`;
}

export function buildTTEmbed(panel: TicketPanel, ref: TicketEntryRef): CCPayload {
  const fn = 'buildTTEmbed';
  const entry = getEntry(panel, ref);
  if (!entry) return buildTTMissingEntry(panel, fn);

  const te = entry.overrides?.ticketEmbed ?? {};
  const hasOverride = Object.keys(te).length > 0;
  const previewColor = checkColor(FILE, fn, 'color', te.color ?? panel.embed.color);

  const embed = verifyBuilder(FILE, fn, 'tt embed settings embed', () =>
    new EmbedBuilder()
      .setColor(previewColor)
      .setTitle(`🖼️ Welcome Embed — ${entryLabel(panel, ref)}`)
      .setDescription('This is the embed posted in the ticket channel the moment it\'s created. Every field below is independent — leave a field blank in its editor to inherit the panel/default value without touching the others.')
      .addFields(
        { name: 'Title',       value: ttEmbedLine(te.title, 'inherits auto-generated title'), inline: false },
        { name: 'Description', value: ttEmbedLine(te.description, 'inherits default welcome message'), inline: false },
        { name: 'Color',       value: te.color !== undefined ? fmtColor(te.color) : `${fmtColor(panel.embed.color)} _(panel default)_`, inline: true },
        { name: 'Footer',      value: ttEmbedLine(te.footer, 'inherits default footer'), inline: true },
        { name: 'Message Content', value: ttEmbedLine(te.messageContent, 'none'), inline: true },
        { name: 'Thumbnail',   value: ttEmbedLine(te.thumbnail, 'none'), inline: false },
        { name: 'Banner/Image', value: ttEmbedLine(te.banner, 'none'), inline: false },
        { name: 'Timestamp',   value: te.showTimestamp ? '🟢 On' : '🔴 Off', inline: true },
      )
      .setFooter({ text: 'Applies only to this button/option — every other ticket type keeps its own welcome embed untouched.' }),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Embed',  TP.TT.edit(panel.id, ref, 'embed'),      ButtonStyle.Primary),
    btn('🖼 Edit Media',  TP.TT.edit(panel.id, ref, 'embedmedia'), ButtonStyle.Secondary),
    btn(te.showTimestamp ? '🕑 Hide Time' : '🕑 Show Time', TP.TT.ctog(panel.id, ref, 'embedTimestamp'), ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('↩️ Reset to Panel Default', TP.TT.reset(panel.id, ref, 'embed'), ButtonStyle.Secondary, !hasOverride),
    btn('← Back',                    TP.TT.main(panel.id, ref),           ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row1, row2] };
  assertUniqueCustomIds('buildTTEmbed', payload);
  return payload;
}

// ── Permissions Section ─────────────────────────────────────────────────────

export function buildPermissionsSection(panel: TicketPanel): CCPayload {
  return buildPDMain(panel);
}

// ── Categories Section ──────────────────────────────────────────────────────

export function buildCategoriesSection(panel: TicketPanel): CCPayload {
  const fn = 'buildCategoriesSection';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const embed = verifyBuilder(FILE, fn, 'categories embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📁 Category Routing')
      .addFields(
        { name: '📂 Open Category',     value: panel.openCategory    ? `<#${panel.openCategory}>`    : '_Not set_', inline: true },
        { name: '🔒 Closed Category',   value: panel.closedCategory  ? `<#${panel.closedCategory}>`  : '_Not set_', inline: true },
        { name: '🗄 Archive Category',  value: panel.archiveCategory ? `<#${panel.archiveCategory}>` : '_Not set_', inline: true },
      )
      .setFooter({ text: 'Enter category channel IDs' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Categories', TP.edit(panel.id, 'categories'), ButtonStyle.Primary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildCategoriesSection', payload);
  return payload;
}

// ── Naming Section ──────────────────────────────────────────────────────────

export function buildNamingSection(panel: TicketPanel): CCPayload {
  const fn = 'buildNamingSection';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const preview = panel.namingScheme
    .replace('{user}', 'johndoe')
    .replace('{username}', 'johndoe')
    .replace('{userid}', '123456789')
    .replace('{displayname}', 'John Doe')
    .replace('{ticket}', 'panel_abc12')
    .replace('{counter}', '0042')
    .replace('{number}', '0042')
    .replace('{date}', '2026-07-11')
    .replace('{time}', '14-30')
    .replace('{year}', '2026')
    .replace('{month}', '07')
    .replace('{day}', '11')
    .replace('{random}', 'x7k2m')
    .replace('{type}', 'support')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 90) || 'ticket';

  const embed = verifyBuilder(FILE, fn, 'naming embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📝 Ticket Naming')
      .addFields(
        { name: 'Current Scheme', value: `\`${panel.namingScheme}\``,    inline: false },
        { name: '👁 Live Preview', value: `\`${preview}\``,              inline: false },
        { name: '📋 Variables',    value: [
          '`{user}` / `{username}` — opener\'s username',
          '`{userid}` — opener\'s Discord ID',
          '`{displayname}` — opener\'s display name',
          '`{counter}` / `{number}` — 4-digit ticket counter',
          '`{date}` — YYYY-MM-DD · `{time}` — HH-MM',
          '`{year}` · `{month}` · `{day}`',
          '`{random}` — 5-char random token',
          '`{type}` — ticket type from the button/menu',
        ].join('\n'),                                                      inline: false },
      )
      .setFooter({ text: 'Channel names are lowercase, max 90 chars, dashes only' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Scheme', TP.edit(panel.id, 'naming'), ButtonStyle.Primary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildNamingSection', payload);
  return payload;
}

// ── Lifecycle Section ───────────────────────────────────────────────────────

export function buildLifecycleSection(panel: TicketPanel): CCPayload {
  const fn = 'buildLifecycleSection';
  const color = checkColor(FILE, fn, 'color', 0xfee75c);

  const embed = verifyBuilder(FILE, fn, 'lifecycle embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🔄 Lifecycle')
      .addFields(
        { name: '🎟 Ticket Limit',       value: `${panel.ticketLimit} per user`,            inline: true },
        { name: '⏱ Cooldown',            value: panel.cooldown > 0 ? `${panel.cooldown}s` : 'None', inline: true },
        { name: '⚡ Priority',           value: panel.priority.charAt(0).toUpperCase() + panel.priority.slice(1), inline: true },
      )
      .setFooter({ text: 'Ticket limit = max open tickets per user on this panel' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit', TP.edit(panel.id, 'lifecycle'), ButtonStyle.Primary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildLifecycleSection', payload);
  return payload;
}

// ── Automation Section ──────────────────────────────────────────────────────

export function buildAutomationSection(panel: TicketPanel): CCPayload {
  const fn = 'buildAutomationSection';
  const color = checkColor(FILE, fn, 'color', 0xf5a623);
  const a = panel.automation;

  const embed = verifyBuilder(FILE, fn, 'automation embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🤖 Automation')
      .addFields(
        { name: '⏰ Auto-close (inactivity)', value: a.autoCloseInactivityMinutes > 0 ? `${a.autoCloseInactivityMinutes}m` : '🔴 Off', inline: true },
        { name: '🗑 Auto-delete after close', value: a.autoDeleteAfterCloseMinutes > 0 ? `${a.autoDeleteAfterCloseMinutes}m` : '🔴 Off', inline: true },
        { name: '⏱ Cooldown',                value: a.cooldownSeconds > 0 ? `${a.cooldownSeconds}s` : '🔴 Off',           inline: true },
        { name: '🔔 Staff Reminder',          value: a.reminderMinutes > 0 ? `${a.reminderMinutes}m` : '🔴 Off',           inline: true },
        { name: '⚠️ Age Warning',             value: (a.ageWarnMinutes ?? 0) > 0 ? `${a.ageWarnMinutes}m` : '🔴 Off',     inline: true },
      )
      .setFooter({ text: 'Set any value to 0 to disable that automation' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit', TP.edit(panel.id, 'automation'), ButtonStyle.Primary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildAutomationSection', payload);
  return payload;
}

// ── Transcripts Section ─────────────────────────────────────────────────────

export function buildTranscriptsSection(panel: TicketPanel): CCPayload {
  const fn = 'buildTranscriptsSection';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const t = panel.transcript;

  const embed = verifyBuilder(FILE, fn, 'transcripts embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📄 Transcripts')
      .addFields(
        { name: '📋 Enabled',    value: t.enabled ? '🟢 Yes' : '🔴 No',                    inline: true },
        { name: '📍 Channel',    value: t.channelId ? `<#${t.channelId}>` : '_Not set_',    inline: true },
        { name: '📦 Formats',    value: t.formats.join(', ') || 'html',                      inline: true },
        { name: '📨 DM to User', value: t.dmUser ? '🟢 Yes' : '🔴 No',                     inline: true },
      )
      .setFooter({ text: 'Transcripts are generated when a ticket is closed' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Settings',    TP.edit(panel.id, 'transcripts'),   ButtonStyle.Primary),
    btn(t.enabled ? '🔴 Disable' : '🟢 Enable', TP.toggle(panel.id, 'transcriptenabled'), ButtonStyle.Secondary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildTranscriptsSection', payload);
  return payload;
}

// ── Statistics Section ──────────────────────────────────────────────────────

export function buildStatsSection(panel: TicketPanel, stats: TicketDashboard): CCPayload {
  const fn = 'buildStatsSection';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const leaderboard = stats.leaderboard.length
    ? stats.leaderboard.slice(0, 5).map(([uid, n], i) => `${i + 1}. <@${uid}> — ${n} claim${n !== 1 ? 's' : ''}`).join('\n')
    : '_No claim data yet_';

  const embed = verifyBuilder(FILE, fn, 'stats embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📊 Statistics')
      .addFields(
        { name: '🎟 Total Opened',      value: String(stats.total),           inline: true },
        { name: '🟢 Currently Open',    value: String(stats.open),            inline: true },
        { name: '🔒 Closed',            value: String(stats.closed),          inline: true },
        { name: '⏱ Avg Response Time',  value: fmtMs(stats.avgResponseMs),   inline: true },
        { name: '📈 Track Response',    value: panel.statistics.trackResponseTime ? '🟢 On' : '🔴 Off', inline: true },
        { name: '📈 Track Claims',      value: panel.statistics.trackClaims    ? '🟢 On' : '🔴 Off', inline: true },
        { name: '🏆 Top Claimers',      value: truncate(leaderboard, 512),    inline: false },
      )
      .setFooter({ text: `Panel: ${panel.name}` }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(panel.statistics.trackResponseTime ? '🔴 Stop Response Tracking' : '🟢 Track Response',
        TP.toggle(panel.id, 'trackresponse'), ButtonStyle.Secondary),
    btn(panel.statistics.trackClaims ? '🔴 Stop Claim Tracking' : '🟢 Track Claims',
        TP.toggle(panel.id, 'trackclaims'), ButtonStyle.Secondary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildStatsSection', payload);
  return payload;
}

// ── Publish Section ─────────────────────────────────────────────────────────

export function buildPublishSection(panel: TicketPanel): CCPayload {
  const fn = 'buildPublishSection';
  const color = checkColor(FILE, fn, 'color', 0x57f287);

  const channelLine = panel.channelId ? `<#${panel.channelId}>` : '_Not set_';
  const msgLine = panel.messageId ? `Message ID: \`${panel.messageId}\`` : '_Not published yet_';

  const embed = verifyBuilder(FILE, fn, 'publish embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📤 Publish Panel')
      .addFields(
        { name: '📍 Current Channel', value: channelLine, inline: true },
        { name: '📌 Message',         value: msgLine,     inline: true },
      )
      .setDescription(
        panel.messageId
          ? '✅ This panel is published. Use **Update** to re-publish in the same channel, or **Publish to Channel** to send it somewhere new.'
          : '⚠️ This panel is not yet published. Click **Publish to Channel** to send it.',
      )
      .setFooter({ text: 'Publishing updates an existing message instead of creating a duplicate' }),
  );

  const components: CCPayload['components'] = [];
  const row0Btns: ButtonBuilder[] = [
    btn('📤 Publish to Channel', TP.edit(panel.id, 'publish'), ButtonStyle.Primary),
  ];
  if (panel.messageId && panel.channelId) {
    row0Btns.push(btn('🔄 Update Existing', TP.repub(panel.id), ButtonStyle.Success));
  }
  row0Btns.push(dashBtn(panel.id), homeBtn());
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(row0Btns));

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildPublishSection', payload);
  return payload;
}

// ── Preview Screen ──────────────────────────────────────────────────────────

export function buildPreviewSection(panel: TicketPanel): CCPayload {
  const fn = 'buildPreviewSection';
  const safeColor = checkColor(FILE, fn, 'previewColor', panel.embed.color);

  const buttonDesc = panel.selectMenu && panel.selectMenu.options.length > 0
    ? `📋 **Select Menu** — ${panel.selectMenu.options.length} option(s): ${panel.selectMenu.options.slice(0, 3).map(o => `\`${o.label}\``).join(', ')}${panel.selectMenu.options.length > 3 ? '...' : ''}`
    : [panel.button, ...panel.additionalButtons].map(b => `[${b.emoji ? b.emoji + ' ' : ''}${b.label}]`).join('  ');

  const embed = verifyBuilder(FILE, fn, 'preview embed', () => {
    const e = new EmbedBuilder()
      .setColor(safeColor)
      .setTitle(truncate(panel.embed.title || '(No title)', 256))
      .setDescription(truncate(panel.embed.description || '(No description)', 4096));

    if (panel.embed.footer)    e.setFooter({ text: truncate(panel.embed.footer, 2048) });
    if (panel.embed.thumbnail) e.setThumbnail(panel.embed.thumbnail);
    if (panel.embed.banner)    e.setImage(panel.embed.banner);
    if (panel.embed.showTimestamp) e.setTimestamp();

    e.addFields({ name: '🔘 Buttons (preview only)', value: truncate(buttonDesc, 512), inline: false });
    return e;
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📤 Publish',  TP.section(panel.id, 'publish'), ButtonStyle.Primary),
    dashBtn(panel.id),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildPreviewSection', payload);
  return payload;
}

// ── Delete Confirm ──────────────────────────────────────────────────────────

export function buildDeleteConfirm(panel: TicketPanel): CCPayload {
  const fn = 'buildDeleteConfirm';
  const color = checkColor(FILE, fn, 'color', 0xed4245);

  const embed = verifyBuilder(FILE, fn, 'delete embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🗑 Delete Panel?')
      .setDescription(`You are about to permanently delete **${truncate(panel.name, 100)}**.\n\nThis removes the panel configuration. The published message (if any) remains in the channel but becomes non-functional.`)
      .setFooter({ text: 'This cannot be undone' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Confirm Delete', TP.delYes(panel.id), ButtonStyle.Danger),
    btn('✖ Cancel',          TP.dash(panel.id),   ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildDeleteConfirm', payload);
  return payload;
}

// ── Success / Error Feedback ────────────────────────────────────────────────

export function buildFeedback(success: boolean, message: string, panelId?: string): CCPayload {
  const fn = 'buildFeedback';
  const color = checkColor(FILE, fn, 'color', success ? 0x57f287 : 0xed4245);

  const embed = verifyBuilder(FILE, fn, 'feedback embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(success ? '✅ Done' : '❌ Error')
      .setDescription(truncate(message, 2000)),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(panelId ? [dashBtn(panelId)] : [listBtn()]),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildFeedback', payload);
  return payload;
}

// ── Template Gallery ────────────────────────────────────────────────────────

export function buildTemplateGallery(templates: TicketTemplate[], offset: number, totalCount: number): CCPayload {
  const fn = 'buildTemplateGallery';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const page = Math.floor(offset / TEMPLATES_PER_PAGE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / TEMPLATES_PER_PAGE));
  const builtInCount = templates.filter(t => t.builtIn).length;
  const customCount  = templates.length - builtInCount;
  const slice = templates.slice(0, TEMPLATES_PER_PAGE);

  const desc = totalCount === 0
    ? 'No templates available.'
    : `**${totalCount}** template${totalCount !== 1 ? 's' : ''} — Page ${page}/${totalPages}\n🔒 ${builtInCount} built-in · 🖊 ${customCount} custom\n\nSelect a template to preview it, then click **Use This Template** to create a pre-configured panel in one click.`;

  const embed = verifyBuilder(FILE, fn, 'gallery embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📋 Template Gallery')
      .setDescription(desc)
      .setFooter({ text: 'Built-in templates cannot be deleted · Save any panel as a custom template from its dashboard' }),
  );

  const components: CCPayload['components'] = [];

  if (slice.length > 0) {
    const select = verifyBuilder(FILE, fn, 'template select', () =>
      new StringSelectMenuBuilder()
        .setCustomId(TP.tgSel(offset))
        .setPlaceholder('Select a template to preview...')
        .addOptions(
          slice.map(t =>
            new StringSelectMenuOptionBuilder()
              .setLabel(truncate(`${t.builtIn ? '🔒 ' : '🖊 '}${t.name}`, 100))
              .setDescription(truncate(t.description || 'No description', 100))
              .setValue(t.id),
          ),
        ),
    );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const prevOffset = offset - TEMPLATES_PER_PAGE;
  const nextOffset = offset + TEMPLATES_PER_PAGE;
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('◀ Prev',   TP.list(prevOffset), ButtonStyle.Secondary, offset === 0),
    btn('▶ Next',   TP.list(nextOffset), ButtonStyle.Secondary, nextOffset >= totalCount),
    listBtn(),
    homeBtn(),
  );
  components.push(navRow);

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildTemplateGallery', payload);
  return payload;
}

export function buildTemplateDetail(template: TicketTemplate): CCPayload {
  const fn = 'buildTemplateDetail';
  const safeColor = checkColor(FILE, fn, 'embedColor', template.panel.embed.color);
  const p = template.panel;

  const buttonLine = p.selectMenu && p.selectMenu.options.length > 0
    ? `📋 Select Menu · ${p.selectMenu.options.length} option(s)`
    : `🔘 ${p.button.label} (${p.button.style})${p.button.emoji ? ` ${p.button.emoji}` : ''}`;

  const qCount = p.modal.enabled ? `${p.modal.questions.length} question(s)` : 'Disabled';

  const embed = verifyBuilder(FILE, fn, 'tpl detail embed', () =>
    new EmbedBuilder()
      .setColor(safeColor)
      .setTitle(`${template.builtIn ? '🔒' : '🖊'} ${truncate(template.name, 100)}`)
      .setDescription(truncate(template.description || 'No description', 512))
      .addFields(
        { name: '📝 Embed Title',   value: truncate(p.embed.title,  256), inline: true  },
        { name: '🎨 Color',         value: `#${p.embed.color.toString(16).padStart(6,'0').toUpperCase()}`, inline: true },
        { name: '🔘 Opener',        value: buttonLine,                     inline: false },
        { name: '📝 Naming Scheme', value: `\`${p.namingScheme}\``,        inline: true  },
        { name: '❓ Questions',     value: qCount,                          inline: true  },
        { name: '⚡ Priority',      value: p.priority,                      inline: true  },
        { name: '📄 Transcripts',   value: p.transcript.enabled ? '🟢 On' : '🔴 Off', inline: true },
        { name: '🤖 Auto-close',    value: p.automation.autoCloseInactivityMinutes > 0
          ? `${p.automation.autoCloseInactivityMinutes}m` : '🔴 Off',      inline: true  },
      )
      .setFooter({ text: `Template ID: ${template.id} · ${template.builtIn ? 'Built-in (read-only)' : 'Custom template'}` }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Use This Template', TP.tplUse(template.id), ButtonStyle.Success),
    ...(!template.builtIn ? [btn('🗑 Delete Template', TP.tplDel(template.id), ButtonStyle.Danger)] : []),
    btn('← Gallery', TP.GALLERY, ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildTemplateDetail', payload);
  return payload;
}

export function buildTplDeleteConfirm(template: TicketTemplate): CCPayload {
  const fn = 'buildTplDeleteConfirm';
  const color = checkColor(FILE, fn, 'color', 0xed4245);

  const embed = verifyBuilder(FILE, fn, 'tpl delete embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🗑 Delete Template?')
      .setDescription(`You are about to permanently delete the custom template **${truncate(template.name, 100)}**.\n\nExisting panels created from this template are not affected.`)
      .setFooter({ text: 'This cannot be undone' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Confirm Delete', TP.tplDelYes(template.id), ButtonStyle.Danger),
    btn('✖ Cancel',          TP.tplDetail(template.id),  ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds('buildTplDeleteConfirm', payload);
  return payload;
}

// ── Template Modals ─────────────────────────────────────────────────────────

export function buildUseTplModal(template: TicketTemplate): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.tplUseM(template.id))
    .setTitle(`Use: ${truncate(template.name, 40)}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Panel Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`e.g. ${template.name} Panel`)
          .setValue(template.name)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID (where to post the panel)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Right-click a text channel → Copy ID')
          .setRequired(false)
          .setMaxLength(20),
      ),
    );
}

export function buildSaveAsTplModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.tplSaveM(panel.id))
    .setTitle('Save as Template')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Template Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`e.g. ${truncate(panel.name, 60)}`)
          .setValue(panel.name)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Short note about what this template is for')
          .setValue(truncate(panel.description || '', 256))
          .setRequired(false)
          .setMaxLength(256),
      ),
    );
}

// ── Modals ──────────────────────────────────────────────────────────────────

function ti(id: string, label: string, style: TextInputStyle, value: string, placeholder: string, required = true, maxLength = 1000): TextInputBuilder {
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

function row<T extends TextInputBuilder>(input: T): ActionRowBuilder<T> {
  return new ActionRowBuilder<T>().addComponents(input);
}

export function buildCreatePanelModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.NEW_M)
    .setTitle('Create Ticket Panel')
    .addComponents(
      row(ti('name',        'Panel Name',        TextInputStyle.Short,     '', 'e.g. Support Tickets')),
      row(ti('description', 'Description',       TextInputStyle.Short,     '', 'Internal note about this panel', false, 256)),
      row(ti('embedTitle',  'Embed Title',        TextInputStyle.Short,     '', 'e.g. 🎫 Open a Support Ticket')),
      row(ti('embedDesc',   'Embed Description',  TextInputStyle.Paragraph, '', 'Shown on the panel embed. Supports {server}, {membercount}', true, 2000)),
      row(ti('btnLabel',    'Button Label',       TextInputStyle.Short,     '', 'e.g. Open Ticket')),
    );
}

export function buildEditGeneralModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'general'))
    .setTitle('Edit General Info')
    .addComponents(
      row(ti('name',        'Panel Name',    TextInputStyle.Short,     panel.name,        'e.g. Support Tickets', true, 100)),
      row(ti('description', 'Description',   TextInputStyle.Short,     panel.description, 'Internal note about this panel', false, 256)),
    );
}

export function buildEditEmbedModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'embed'))
    .setTitle('Edit Embed')
    .addComponents(
      row(ti('title',       'Embed Title',       TextInputStyle.Short,     panel.embed.title,             'e.g. 🎫 Support Tickets', true, 256)),
      row(ti('description', 'Embed Description', TextInputStyle.Paragraph, panel.embed.description,       'Message shown on the panel. Use {server}, {membercount}…', true, 2000)),
      row(ti('color',       'Color (hex)',        TextInputStyle.Short,     fmtColor(panel.embed.color),  'e.g. 5865F2', true, 6)),
      row(ti('footer',      'Footer Text',        TextInputStyle.Short,     panel.embed.footer || '',      'Optional footer', false, 256)),
      row(ti('messageContent', 'Message Content', TextInputStyle.Paragraph, panel.embed.messageContent || '', 'Text sent above the embed. Supports {user} {username} {displayname} {userid} {ticket} {type}', false, 2000)),
    );
}

export function buildEditMediaModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'media'))
    .setTitle('Edit Media')
    .addComponents(
      row(ti('thumbnail', 'Thumbnail URL', TextInputStyle.Short, panel.embed.thumbnail || '', 'https://…  (small image, top-right)', false, 512)),
      row(ti('banner',    'Image/Banner URL', TextInputStyle.Short, panel.embed.banner || '', 'https://…  (large image below)', false, 512)),
    );
}

export function buildEditCategoriesModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'categories'))
    .setTitle('Category Routing')
    .addComponents(
      row(ti('openCategory',    'Open Category ID',    TextInputStyle.Short, panel.openCategory    || '', 'ID of the category for open tickets',    false, 20)),
      row(ti('closedCategory',  'Closed Category ID',  TextInputStyle.Short, panel.closedCategory  || '', 'ID of the category for closed tickets',  false, 20)),
      row(ti('archiveCategory', 'Archive Category ID', TextInputStyle.Short, panel.archiveCategory || '', 'ID of the category for archived tickets', false, 20)),
    );
}

export function buildEditNamingModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'naming'))
    .setTitle('Ticket Naming Scheme')
    .addComponents(
      row(ti('namingScheme', 'Naming Scheme', TextInputStyle.Short, panel.namingScheme, 'e.g. {displayname}-{counter} or support-{username}', true, 90)),
    );
}

export function buildTTEditCategoriesModal(panel: TicketPanel, ref: TicketEntryRef): ModalBuilder {
  const o = getEntry(panel, ref)?.overrides ?? {};
  return new ModalBuilder()
    .setCustomId(TP.TT.ttModal(panel.id, ref, 'cat'))
    .setTitle('Category Routing (this type)')
    .addComponents(
      row(ti('openCategory',    'Open Category ID',    TextInputStyle.Short, o.openCategory    || '', 'Blank = inherit panel default', false, 20)),
      row(ti('closedCategory',  'Closed Category ID',  TextInputStyle.Short, o.closedCategory  || '', 'Blank = inherit panel default', false, 20)),
      row(ti('archiveCategory', 'Archive Category ID', TextInputStyle.Short, o.archiveCategory || '', 'Blank = inherit panel default', false, 20)),
    );
}

export function buildTTEditRolesModal(panel: TicketPanel, ref: TicketEntryRef): ModalBuilder {
  const o = getEntry(panel, ref)?.overrides ?? {};
  return new ModalBuilder()
    .setCustomId(TP.TT.ttModal(panel.id, ref, 'roles'))
    .setTitle('Roles (this type)')
    .addComponents(
      row(ti('supportRoles', 'Support Role IDs', TextInputStyle.Paragraph, (o.supportRoles ?? []).join(','), 'Comma-separated — blank = inherit panel default', false, 1000)),
      row(ti('pingRoles',    'Ping Role IDs',    TextInputStyle.Paragraph, (o.pingRoles ?? []).join(','),    'Comma-separated — blank = inherit panel default', false, 1000)),
    );
}

export function buildTTEditNamingModal(panel: TicketPanel, ref: TicketEntryRef): ModalBuilder {
  const o = getEntry(panel, ref)?.overrides ?? {};
  return new ModalBuilder()
    .setCustomId(TP.TT.ttModal(panel.id, ref, 'naming'))
    .setTitle('Naming Scheme (this type)')
    .addComponents(
      row(ti('namingScheme', 'Naming Scheme', TextInputStyle.Short, o.namingScheme || '', 'Blank = auto from label, e.g. sales-{counter}', false, 90)),
    );
}

export function buildTTEditEmbedModal(panel: TicketPanel, ref: TicketEntryRef): ModalBuilder {
  const te = getEntry(panel, ref)?.overrides?.ticketEmbed ?? {};
  return new ModalBuilder()
    .setCustomId(TP.TT.ttModal(panel.id, ref, 'embed'))
    .setTitle('Welcome Embed (this type)')
    .addComponents(
      row(ti('title',       'Embed Title',       TextInputStyle.Short,     te.title || '',       'Blank = auto-generated title', false, 256)),
      row(ti('description', 'Embed Description', TextInputStyle.Paragraph, te.description || '', 'Blank = inherit default welcome message', false, 2000)),
      row(ti('color',       'Color (hex)',        TextInputStyle.Short,     te.color !== undefined ? fmtColor(te.color) : '', 'Blank = inherit panel color, e.g. 5865F2', false, 6)),
      row(ti('footer',      'Footer Text',        TextInputStyle.Short,     te.footer || '',      'Blank = inherit default footer', false, 256)),
      row(ti('messageContent', 'Message Content', TextInputStyle.Paragraph, te.messageContent || '', 'Blank = none. Supports {user} {username} {displayname} {userid} {ticket} {type}', false, 2000)),
    );
}

export function buildTTEditEmbedMediaModal(panel: TicketPanel, ref: TicketEntryRef): ModalBuilder {
  const te = getEntry(panel, ref)?.overrides?.ticketEmbed ?? {};
  return new ModalBuilder()
    .setCustomId(TP.TT.ttModal(panel.id, ref, 'embedmedia'))
    .setTitle('Welcome Embed Media (this type)')
    .addComponents(
      row(ti('thumbnail', 'Thumbnail URL',    TextInputStyle.Short, te.thumbnail || '', 'https://…  (small image, top-right) — blank = none', false, 512)),
      row(ti('banner',    'Image/Banner URL', TextInputStyle.Short, te.banner || '',    'https://…  (large image below) — blank = none', false, 512)),
    );
}

export function buildEditLifecycleModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'lifecycle'))
    .setTitle('Lifecycle Settings')
    .addComponents(
      row(ti('ticketLimit', 'Ticket Limit (per user)', TextInputStyle.Short, String(panel.ticketLimit), '1 = only one open ticket at a time', true, 3)),
      row(ti('cooldown',    'Cooldown (seconds)',       TextInputStyle.Short, String(panel.cooldown),    '0 = disabled', true, 6)),
      row(ti('priority',    'Priority',                 TextInputStyle.Short, panel.priority,            'low | normal | high | urgent', true, 6)),
    );
}

export function buildEditAutomationModal(panel: TicketPanel): ModalBuilder {
  const a = panel.automation;
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'automation'))
    .setTitle('Automation')
    .addComponents(
      row(ti('autoCloseInactivityMinutes',  'Auto-close after (minutes)',   TextInputStyle.Short, String(a.autoCloseInactivityMinutes),  '0 = off', true, 6)),
      row(ti('autoDeleteAfterCloseMinutes', 'Auto-delete after close (min)', TextInputStyle.Short, String(a.autoDeleteAfterCloseMinutes), '0 = off', true, 6)),
      row(ti('cooldownSeconds',             'Cooldown (seconds)',            TextInputStyle.Short, String(a.cooldownSeconds),             '0 = off', true, 6)),
      row(ti('reminderMinutes',             'Staff reminder (minutes)',      TextInputStyle.Short, String(a.reminderMinutes),             '0 = off', true, 6)),
      row(ti('ageWarnMinutes',              'Age warning (minutes)',         TextInputStyle.Short, String(a.ageWarnMinutes ?? 0),         'Pings support roles once when a ticket is quiet this long. 0 = off', true, 6)),
    );
}

export function buildEditTranscriptsModal(panel: TicketPanel): ModalBuilder {
  const t = panel.transcript;
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'transcripts'))
    .setTitle('Transcript Settings')
    .addComponents(
      row(ti('channelId', 'Channel ID',     TextInputStyle.Short, t.channelId || '', 'Channel to post transcripts in', false, 20)),
      row(ti('formats',   'Formats',        TextInputStyle.Short, t.formats.join(','), 'html, markdown (comma-separated)', true, 20)),
      row(ti('dmUser',    'DM to User',     TextInputStyle.Short, String(t.dmUser), 'true or false', true, 5)),
    );
}

export function buildEditStaffRolesModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'staffroles'))
    .setTitle('Staff Role IDs')
    .addComponents(
      row(ti('supportRoles', 'Support Role IDs',  TextInputStyle.Paragraph, panel.supportRoles.join(','), 'Comma-separated role IDs', false, 1000)),
      row(ti('managerRoles', 'Manager Role IDs',  TextInputStyle.Paragraph, panel.managerRoles.join(','), 'Comma-separated role IDs', false, 1000)),
      row(ti('pingRoles',    'Ping Role IDs',     TextInputStyle.Paragraph, panel.pingRoles.join(','),    'Comma-separated role IDs — pinged on open', false, 1000)),
    );
}

export function buildEditAccessRolesModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'accessroles'))
    .setTitle('Access Control')
    .addComponents(
      row(ti('allowedRoles', 'Allowed Role IDs', TextInputStyle.Paragraph, panel.allowedRoles.join(','), 'Only these roles can open tickets (empty = everyone)', false, 1000)),
      row(ti('blockedRoles', 'Blocked Role IDs', TextInputStyle.Paragraph, panel.blockedRoles.join(','), 'These roles cannot open tickets', false, 1000)),
    );
}

export function buildEditLogChannelModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'logchannel'))
    .setTitle('Channels')
    .addComponents(
      row(ti('logChannelId',   'Log Channel ID',         TextInputStyle.Short, panel.logChannelId   || '', 'Channel where ticket actions are logged', false, 20)),
      row(ti('statsChannelId', 'Weekly Stats Channel ID', TextInputStyle.Short, panel.statsChannelId || '', 'Posts a stats summary here every Monday. Leave blank to disable', false, 20)),
    );
}

export function buildPrimaryButtonModal(panel: TicketPanel): ModalBuilder {
  const b = panel.button;
  return new ModalBuilder()
    .setCustomId(TP.btnPrimaryM(panel.id))
    .setTitle('Edit Primary Button')
    .addComponents(
      row(ti('label',      'Button Label', TextInputStyle.Short, b.label,              'e.g. Open Ticket', true, 80)),
      row(ti('style',      'Style',        TextInputStyle.Short, b.style,              'Primary | Secondary | Success | Danger', true, 10)),
      row(ti('emoji',      'Emoji',        TextInputStyle.Short, b.emoji || '',        'e.g. 🎫 (optional)', false, 32)),
      row(ti('ticketType', 'Ticket Type',  TextInputStyle.Short, b.ticketType,         'Internal key, e.g. support', true, 50)),
    );
}

export function buildExtraButtonModal(_panelId: string, existingBtn: TicketButtonConfig | null, customIdSuffix: string): ModalBuilder {
  const isEdit = existingBtn !== null;
  return new ModalBuilder()
    .setCustomId(customIdSuffix)
    .setTitle(isEdit ? 'Edit Extra Button' : 'Add Extra Button')
    .addComponents(
      row(ti('label',      'Button Label', TextInputStyle.Short, existingBtn?.label      || '', 'e.g. General Support', true, 80)),
      row(ti('style',      'Color',        TextInputStyle.Short, existingBtn?.style      || 'Blue', 'Blue | Grey | Green | Red', true, 10)),
      row(ti('emoji',      'Emoji',        TextInputStyle.Short, existingBtn?.emoji      || '', 'e.g. 🎫 (optional)', false, 32)),
      row(ti('ticketType', 'Ticket Type',  TextInputStyle.Short, existingBtn?.ticketType || '', 'Internal key, e.g. billing', true, 50)),
    );
}

export function buildSmOptionModal(_panelId: string, existingOpt: TicketSelectMenuOption | null, customIdSuffix: string): ModalBuilder {
  const isEdit = existingOpt !== null;
  return new ModalBuilder()
    .setCustomId(customIdSuffix)
    .setTitle(isEdit ? 'Edit Select Option' : 'Add Select Option')
    .addComponents(
      row(ti('label',       'Option Label',  TextInputStyle.Short, existingOpt?.label       || '', 'e.g. General Support', true, 100)),
      row(ti('ticketType',  'Ticket Type',   TextInputStyle.Short, existingOpt?.ticketType  || '', 'Internal key, e.g. billing', true, 50)),
      row(ti('description', 'Description',   TextInputStyle.Short, existingOpt?.description || '', 'Shown under the label (optional)', false, 100)),
      row(ti('emoji',       'Emoji',         TextInputStyle.Short, existingOpt?.emoji       || '', '🎫 (optional)', false, 32)),
      row(ti('categoryId',  'Category ID',   TextInputStyle.Short, existingOpt?.categoryId  || '', 'Discord category ID for this ticket (optional)', false, 20)),
    );
}

export function buildSmPlaceholderModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.modal(panel.id, 'smplaceholder'))
    .setTitle('Select Menu Placeholder')
    .addComponents(
      row(ti('placeholder', 'Placeholder Text', TextInputStyle.Short, panel.selectMenu?.placeholder || '', 'e.g. Select a ticket type…', false, 150)),
    );
}

export function buildPublishChannelModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.pubModal(panel.id))
    .setTitle('Publish to Channel')
    .addComponents(
      row(ti('channelId', 'Channel ID', TextInputStyle.Short, panel.channelId || '', 'The text channel to post the panel in', true, 20)),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Builder UI — Phase 4
// All functions below share the local `ti`, `row`, `btn`, `homeBtn`,
// `dashBtn`, `truncate`, `checkColor`, `verifyBuilder`, `assertUniqueCustomIds`
// helpers defined earlier in this file.
// ─────────────────────────────────────────────────────────────────────────────

// ── Form Builder Main ────────────────────────────────────────────────────────

export function buildFormBuilderMain(panel: TicketPanel): CCPayload {
  const fn    = 'buildFormBuilderMain';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const forms = panel.forms ?? [];

  const formsText = forms.length === 0
    ? '_No forms configured yet. Use **➕ New Form** to create one from a built-in template, or **📥 Import JSON** to paste an exported form._'
    : forms.map((f, i) => {
        const qn    = `${f.questions.length} q`;
        const chain = f.defaultNextFormId
          ? `→ ${truncate(forms.find(x => x.id === f.defaultNextFormId)?.name ?? f.defaultNextFormId, 30)}`
          : f.nextRules.length > 0 ? `${f.nextRules.length} rule(s)` : 'no chain';
        return `${i + 1}. **${truncate(f.name, 50)}** — ${qn}, ${chain}`;
      }).join('\n');

  const embed = verifyBuilder(FILE, fn, 'frm-main embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📝 Form Builder')
      .setDescription(
        'Multi-step forms with typed questions, conditional logic, and chaining.\n' +
        'Assign a form to a button in the **🔘 Button** section.',
      )
      .addFields({ name: `📋 Forms (${forms.length})`, value: truncate(formsText, 1024), inline: false })
      .setFooter({ text: 'Forms replace the legacy 5-question modal · up to 5 questions per form' }),
  );

  const components: CCPayload['components'] = [];

  if (forms.length > 0) {
    const sel = verifyBuilder(FILE, fn, 'frm-main sel', () =>
      new StringSelectMenuBuilder()
        .setCustomId(TP.FRM.formSel(panel.id))
        .setPlaceholder('Select a form to view or edit…')
        .addOptions(
          forms.slice(0, 25).map(f =>
            new StringSelectMenuOptionBuilder()
              .setLabel(truncate(f.name, 100))
              .setDescription(truncate(`${f.questions.length} question(s)${f.defaultNextFormId ? ' · chained' : ''}`, 100))
              .setValue(f.id),
          ),
        ),
    );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('➕ New Form',    TP.FRM.newGallery(panel.id), ButtonStyle.Primary),
      btn('📥 Import JSON', TP.FRM.importForm(panel.id), ButtonStyle.Secondary),
      dashBtn(panel.id),
      homeBtn(),
    ),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildFormBuilderMain', payload);
  return payload;
}

// ── Form New Gallery ──────────────────────────────────────────────────────────

export function buildFormNewGallery(panel: TicketPanel): CCPayload {
  const fn    = 'buildFormNewGallery';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const embed = verifyBuilder(FILE, fn, 'frm-gallery embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📝 New Form — Choose a Template')
      .setDescription(
        'Pick a starting point. All templates can be fully customised after creation.\n' +
        'Choose **🧩 Custom** to start with a blank form.',
      )
      .addFields(
        FORM_TEMPLATES.map(t => ({ name: `${t.emoji} ${t.name}`, value: truncate(t.description, 200), inline: true })),
      )
      .setFooter({ text: 'Questions can be added, removed and reordered after creation' }),
  );

  // 7 templates — row0: first 5, row1: remaining 2 + nav
  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...FORM_TEMPLATES.slice(0, 5).map(t =>
      btn(`${t.emoji} ${t.name}`, TP.FRM.newUse(panel.id, t.key), ButtonStyle.Secondary),
    ),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...FORM_TEMPLATES.slice(5).map(t =>
      btn(`${t.emoji} ${t.name}`, TP.FRM.newUse(panel.id, t.key), ButtonStyle.Secondary),
    ),
    btn('← Forms', TP.FRM.main(panel.id), ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildFormNewGallery', payload);
  return payload;
}

// ── Form Detail ───────────────────────────────────────────────────────────────

export function buildFormDetail(panel: TicketPanel, form: TicketForm): CCPayload {
  const fn    = 'buildFormDetail';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const forms = panel.forms ?? [];

  const qText = form.questions.length === 0
    ? '_No questions yet. Click **➕ Add Question** to get started._'
    : form.questions.map((q, i) => {
        const meta = QUESTION_TYPE_META[q.type];
        const cond = q.showIf ? ` _(if \`${q.showIf.questionId}\`=\`"${q.showIf.equals}"\`)_` : '';
        return `${i + 1}. ${meta.emoji} **${truncate(q.title, 50)}** (${q.required ? 'required' : 'optional'})${cond}`;
      }).join('\n');

  const chainText = form.defaultNextFormId
    ? `Default → **${forms.find(f => f.id === form.defaultNextFormId)?.name ?? form.defaultNextFormId}**`
    : form.nextRules.length > 0
      ? `${form.nextRules.length} conditional rule(s) — no default`
      : '_(none — chain ends here)_';

  const embed = verifyBuilder(FILE, fn, 'frm-detail embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`📝 ${truncate(form.name, 100)}`)
      .setDescription(truncate(form.description || '_(No description)_', 512))
      .addFields(
        { name: `❓ Questions (${form.questions.length}/5)`, value: truncate(qText, 1024), inline: false },
        { name: '🔗 Chain',   value: truncate(chainText, 256), inline: true },
        { name: '🆔 Form ID', value: `\`${form.id}\``,         inline: true },
      )
      .setFooter({ text: `Panel: ${panel.name}` }),
  );

  const components: CCPayload['components'] = [];

  if (form.questions.length > 0) {
    const sel = verifyBuilder(FILE, fn, 'frm-detail qsel', () =>
      new StringSelectMenuBuilder()
        .setCustomId(TP.FRM.qSel(panel.id, form.id))
        .setPlaceholder('Select a question to edit…')
        .addOptions(
          form.questions.slice(0, 5).map((q, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(truncate(`${i + 1}. ${q.title}`, 100))
              .setDescription(truncate(`${QUESTION_TYPE_META[q.type].label} · ${q.required ? 'required' : 'optional'}`, 100))
              .setValue(String(i)),
          ),
        ),
    );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel));
  }

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Rename',      TP.FRM.rename(panel.id, form.id),    ButtonStyle.Primary),
    btn('➕ Add Question', TP.FRM.qAdd(panel.id, form.id),     ButtonStyle.Primary,   form.questions.length >= 5),
    btn('🔗 Chain',       TP.FRM.chain(panel.id, form.id),     ButtonStyle.Secondary),
    btn('📌 Assign',      TP.FRM.assign(panel.id, form.id),    ButtonStyle.Secondary),
    btn('👁 Preview',     TP.FRM.preview(panel.id, form.id),   ButtonStyle.Secondary, form.questions.length === 0),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📋 Duplicate',   TP.FRM.dup(panel.id, form.id),       ButtonStyle.Secondary),
    btn('📤 Export JSON', TP.FRM.exportForm(panel.id, form.id),ButtonStyle.Secondary),
    btn('🗑 Delete Form', TP.FRM.del(panel.id, form.id),       ButtonStyle.Danger),
    btn('← Forms',       TP.FRM.main(panel.id),               ButtonStyle.Secondary),
    homeBtn(),
  );
  components.push(row0, row1);

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildFormDetail', payload);
  return payload;
}

// ── Form Delete Confirm ───────────────────────────────────────────────────────

export function buildFormDeleteConfirm(panel: TicketPanel, form: TicketForm): CCPayload {
  const fn    = 'buildFormDeleteConfirm';
  const color = checkColor(FILE, fn, 'color', 0xed4245);

  const embed = verifyBuilder(FILE, fn, 'frm-del embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🗑 Delete Form?')
      .setDescription(
        `You are about to permanently delete **${truncate(form.name, 100)}** ` +
        `(${form.questions.length} question(s)).\n\n` +
        'Any button or select-menu option referencing this form will fall back to the legacy modal. ' +
        '**This cannot be undone.**',
      ),
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Confirm Delete', TP.FRM.delYes(panel.id, form.id), ButtonStyle.Danger),
    btn('✖ Cancel',         TP.FRM.detail(panel.id, form.id), ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [btnRow] };
  assertUniqueCustomIds('buildFormDeleteConfirm', payload);
  return payload;
}

// ── Form Chain View ───────────────────────────────────────────────────────────

export function buildFormChainView(panel: TicketPanel, form: TicketForm): CCPayload {
  const fn    = 'buildFormChainView';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const forms = panel.forms ?? [];

  const defaultName = form.defaultNextFormId
    ? (forms.find(f => f.id === form.defaultNextFormId)?.name ?? `_(unknown: ${form.defaultNextFormId})_`)
    : '_None — chain ends here_';

  const rulesText = form.nextRules.length === 0
    ? '_No conditional rules_'
    : form.nextRules.map((r, i) => {
        const nextName = forms.find(f => f.id === r.nextFormId)?.name ?? r.nextFormId;
        return `${i + 1}. if \`${r.questionId}\`=\`"${r.equals}"\` → **${nextName}**`;
      }).join('\n');

  const embed = verifyBuilder(FILE, fn, 'frm-chain embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🔗 Form Chaining')
      .setDescription(
        'Chain rules are evaluated **after** this form is submitted. ' +
        'The first matching rule wins; the default is used if no rule matches.',
      )
      .addFields(
        { name: '🔀 Default Next Form',                        value: truncate(defaultName, 512),  inline: false },
        { name: `📋 Conditional Rules (${form.nextRules.length})`, value: truncate(rulesText, 1024), inline: false },
      )
      .setFooter({ text: `Form: ${form.name}` }),
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Edit Chain', TP.FRM.chainSet(panel.id, form.id), ButtonStyle.Primary),
    btn('← Form',       TP.FRM.detail(panel.id, form.id),   ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [btnRow] };
  assertUniqueCustomIds('buildFormChainView', payload);
  return payload;
}

// ── Form Assign View ──────────────────────────────────────────────────────────

export function buildFormAssignView(panel: TicketPanel, form: TicketForm): CCPayload {
  const fn    = 'buildFormAssignView';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const lines: string[] = [
    `${panel.button.formId === form.id ? '✅' : '○'} **Primary button**: ${panel.button.label} (\`primary\`)`,
    ...panel.additionalButtons.map((b, i) =>
      `${b.formId === form.id ? '✅' : '○'} **Extra #${i + 1}**: ${b.label} (\`extra:${i}\`)`,
    ),
    ...(panel.selectMenu?.options ?? []).map((o, i) =>
      `${o.formId === form.id ? '✅' : '○'} **Option #${i + 1}**: ${o.label} (\`opt:${i}\`)`,
    ),
  ];

  const embed = verifyBuilder(FILE, fn, 'frm-assign embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('📌 Assign Form to Button / Option')
      .setDescription(
        'Select an entry below to attach this form to it. ' +
        'Users will see this form when they click that button or pick that option.',
      )
      .addFields({ name: '🔘 Current Assignments  (✅ = this form)', value: truncate(lines.join('\n'), 1024), inline: false })
      .setFooter({ text: `Form: ${form.name} · ID: ${form.id}` }),
  );

  const components: CCPayload['components'] = [];

  const opts: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder()
      .setLabel(truncate(`Primary: ${panel.button.label}`, 100))
      .setDescription(truncate(`type: ${panel.button.ticketType}`, 100))
      .setValue('primary')
      .setDefault(panel.button.formId === form.id),
    ...panel.additionalButtons.map((b, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(truncate(`Extra #${i + 1}: ${b.label}`, 100))
        .setDescription(truncate(`type: ${b.ticketType}`, 100))
        .setValue(`extra:${i}`)
        .setDefault(b.formId === form.id),
    ),
    ...(panel.selectMenu?.options ?? []).map((o, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(truncate(`Option #${i + 1}: ${o.label}`, 100))
        .setDescription(truncate(`type: ${o.ticketType}`, 100))
        .setValue(`opt:${i}`)
        .setDefault(o.formId === form.id),
    ),
  ];

  if (opts.length > 0) {
    const sel = verifyBuilder(FILE, fn, 'frm-assign sel', () =>
      new StringSelectMenuBuilder()
        .setCustomId(TP.FRM.assignSel(panel.id, form.id))
        .setPlaceholder('Pick a button or option to assign this form…')
        .addOptions(opts.slice(0, 25)),
    );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('← Form', TP.FRM.detail(panel.id, form.id), ButtonStyle.Secondary),
      homeBtn(),
    ),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildFormAssignView', payload);
  return payload;
}

// ── Question Type Picker ──────────────────────────────────────────────────────

export function buildQAddTypePicker(panel: TicketPanel, form: TicketForm): CCPayload {
  const fn    = 'buildQAddTypePicker';
  const color = checkColor(FILE, fn, 'color', 0x5865f2);

  const embed = verifyBuilder(FILE, fn, 'qadd-type embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('➕ Add Question — Choose Type')
      .addFields(
        QUESTION_TYPES.map(t => ({
          name:   `${QUESTION_TYPE_META[t].emoji} ${QUESTION_TYPE_META[t].label}`,
          value:  truncate(QUESTION_TYPE_META[t].hint, 200),
          inline: true,
        })),
      )
      .setFooter({ text: 'Each type has built-in validation applied automatically' }),
  );

  const sel = verifyBuilder(FILE, fn, 'qadd-type sel', () =>
    new StringSelectMenuBuilder()
      .setCustomId(TP.FRM.qAddType(panel.id, form.id))
      .setPlaceholder('Select a question type…')
      .addOptions(
        QUESTION_TYPES.map(t =>
          new StringSelectMenuOptionBuilder()
            .setLabel(truncate(`${QUESTION_TYPE_META[t].emoji} ${QUESTION_TYPE_META[t].label}`, 100))
            .setDescription(truncate(QUESTION_TYPE_META[t].hint, 100))
            .setValue(t),
        ),
      ),
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('← Form', TP.FRM.detail(panel.id, form.id), ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = {
    content: '',
    embeds:  [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel),
      btnRow,
    ],
  };
  assertUniqueCustomIds('buildQAddTypePicker', payload);
  return payload;
}

// ── Question Detail ───────────────────────────────────────────────────────────

export function buildQFrmDetail(panel: TicketPanel, form: TicketForm, idx: number): CCPayload {
  const fn    = 'buildQFrmDetail';
  const q     = form.questions[idx];
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const meta  = QUESTION_TYPE_META[q?.type ?? 'short_text'];

  const condText = q?.showIf
    ? `When \`${q.showIf.questionId}\` equals \`"${q.showIf.equals}"\``
    : '_No condition — always shown_';

  const embed = verifyBuilder(FILE, fn, 'qfrm-detail embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`${meta.emoji} Question #${idx + 1}: ${truncate(q?.title ?? '(missing)', 80)}`)
      .addFields(
        { name: '🏷 Type',        value: meta.label,                                                                  inline: true  },
        { name: '✔ Required',     value: q?.required ? '✅ Yes' : '❌ No',                                           inline: true  },
        { name: '💬 Placeholder', value: truncate(q?.placeholder || '_(none)_', 256),                                inline: false },
        { name: '📝 Description', value: truncate(q?.description || '_(none)_', 256),                                inline: false },
        { name: '📏 Length',      value: `Min: ${q?.minLength ?? 0} · Max: ${q?.maxLength ?? '∞'}`,                  inline: true  },
        { name: '🔍 Validation',  value: q?.validationRegex ? `\`${truncate(q.validationRegex, 50)}\`` : '_(none)_', inline: true  },
        { name: '🔀 Condition',   value: truncate(condText, 512),                                                     inline: false },
      )
      .setFooter({ text: `Q ID: ${q?.id ?? '?'} · Form: ${form.name}` }),
  );

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✏️ Basic',      TP.FRM.qBasic(panel.id, form.id, idx), ButtonStyle.Primary),
    btn('📏 Length',     TP.FRM.qLen(panel.id, form.id, idx),   ButtonStyle.Secondary),
    btn('🔍 Validation', TP.FRM.qVal(panel.id, form.id, idx),   ButtonStyle.Secondary),
    btn('🔀 Condition',  TP.FRM.qCond(panel.id, form.id, idx),  ButtonStyle.Secondary),
    btn(
      q?.required ? '❌ Make Optional' : '✅ Make Required',
      TP.FRM.qReq(panel.id, form.id, idx),
      ButtonStyle.Secondary,
    ),
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('⬆ Up',     TP.FRM.qUp(panel.id, form.id, idx),   ButtonStyle.Secondary, idx === 0),
    btn('⬇ Down',   TP.FRM.qDown(panel.id, form.id, idx), ButtonStyle.Secondary, idx >= form.questions.length - 1),
    btn('🗑 Remove', TP.FRM.qRm(panel.id, form.id, idx),   ButtonStyle.Danger),
    btn('← Form',   TP.FRM.detail(panel.id, form.id),     ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row0, row1] };
  assertUniqueCustomIds('buildQFrmDetail', payload);
  return payload;
}

// ── Question Conditional View ─────────────────────────────────────────────────

export function buildQCondView(panel: TicketPanel, form: TicketForm, idx: number): CCPayload {
  const fn    = 'buildQCondView';
  const q     = form.questions[idx];
  const color = checkColor(FILE, fn, 'color', 0x5865f2);
  const forms = panel.forms ?? [];

  const condText = q?.showIf
    ? `This question is shown **only when** \`${q.showIf.questionId}\` equals \`"${q.showIf.equals}"\`.`
    : '_No condition set — this question is always shown._';

  const embed = verifyBuilder(FILE, fn, 'qcond embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`🔀 Condition — ${truncate(q?.title ?? '(missing)', 60)}`)
      .setDescription(condText)
      .addFields({
        name:   '💡 How it works',
        value:  'A condition makes this question appear only when a previous answer matches. ' +
                'The source must be from an **earlier form** in the chain, or `__ticketType` (the button clicked).',
        inline: false,
      })
      .setFooter({ text: 'Select a source question below, then enter the matching value' }),
  );

  // Collect source questions from all forms (excluding self) + __ticketType
  const allQOpts: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder()
      .setLabel('__ticketType — button/option that started the flow')
      .setValue('__ticketType')
      .setDefault(q?.showIf?.questionId === '__ticketType'),
  ];
  for (const f of forms) {
    for (const fq of f.questions) {
      if (f.id === form.id && fq.id === q?.id) continue;
      allQOpts.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`${fq.title} (from "${f.name}")`, 100))
          .setDescription(truncate(`ID: ${fq.id}`, 100))
          .setValue(fq.id)
          .setDefault(q?.showIf?.questionId === fq.id),
      );
    }
  }

  const components: CCPayload['components'] = [];

  if (allQOpts.length > 0) {
    const sel = verifyBuilder(FILE, fn, 'qcond pick sel', () =>
      new StringSelectMenuBuilder()
        .setCustomId(TP.FRM.qCondPick(panel.id, form.id, idx))
        .setPlaceholder('Pick source question for condition…')
        .addOptions(allQOpts.slice(0, 25)),
    );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel));
  }

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(q?.showIf ? [btn('🗑 Clear Condition', TP.FRM.qCondClear(panel.id, form.id, idx), ButtonStyle.Danger)] : []),
    btn('← Question', TP.FRM.qDetail(panel.id, form.id, idx), ButtonStyle.Secondary),
    homeBtn(),
  );
  components.push(btnRow);

  const payload: CCPayload = { content: '', embeds: [embed], components };
  assertUniqueCustomIds('buildQCondView', payload);
  return payload;
}

// ── Form Builder Modals ───────────────────────────────────────────────────────

export function buildFormRenameModal(panel: TicketPanel, form: TicketForm): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.renameM(panel.id, form.id))
    .setTitle('Rename Form')
    .addComponents(
      row(ti('name',        'Form Name',   TextInputStyle.Short, form.name,             'e.g. Support Details', true,  100)),
      row(ti('description', 'Description', TextInputStyle.Short, form.description ?? '', 'Brief note (optional)', false, 256)),
    );
}

export function buildFormChainModal(panel: TicketPanel, form: TicketForm): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.chainM(panel.id, form.id))
    .setTitle('Edit Form Chaining')
    .addComponents(
      row(ti('defaultNextFormId', 'Default Next Form ID',    TextInputStyle.Short,
        form.defaultNextFormId ?? '', 'Leave empty to end the chain here', false, 100)),
      row(ti('nextRulesJson',     'Conditional Rules (JSON)', TextInputStyle.Paragraph,
        form.nextRules.length ? JSON.stringify(form.nextRules, null, 0) : '',
        '[{"questionId":"x","equals":"y","nextFormId":"z"}] or leave empty', false, 2000)),
    );
}

export function buildFormImportModal(panel: TicketPanel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.importM(panel.id))
    .setTitle('Import Form from JSON')
    .addComponents(
      row(ti('json', 'Form JSON', TextInputStyle.Paragraph, '', 'Paste exported form JSON here', true, 4000)),
    );
}

export function buildQAddModal(panelId: string, formId: string, type: string): ModalBuilder {
  const meta = QUESTION_TYPE_META[type as QuestionType] ?? QUESTION_TYPE_META['short_text'];
  return new ModalBuilder()
    .setCustomId(TP.FRM.qAddM(panelId, formId, type))
    .setTitle(truncate(`Add ${meta.label} Question`, 45))
    .addComponents(
      row(ti('title',       'Question Title',            TextInputStyle.Short, '',        'e.g. Describe your issue',    true,  100)),
      row(ti('placeholder', 'Placeholder / Hint',        TextInputStyle.Short, meta.hint, 'Shown inside the text box',   false, 100)),
      row(ti('defaultValue','Default Value',             TextInputStyle.Short, '',        'Pre-filled answer (optional)', false, 100)),
      row(ti('description', 'Description (below label)', TextInputStyle.Short, '',        'Extra help text (optional)',   false, 256)),
    );
}

export function buildQBasicModal(panelId: string, formId: string, idx: number, q: FormQuestion): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.qBasicM(panelId, formId, idx))
    .setTitle('Edit Question')
    .addComponents(
      row(ti('title',       'Question Title',            TextInputStyle.Short, q.title,            'e.g. Describe your issue', true,  100)),
      row(ti('placeholder', 'Placeholder / Hint',        TextInputStyle.Short, q.placeholder  ?? '', 'Shown in the text box',  false, 100)),
      row(ti('defaultValue','Default Value',             TextInputStyle.Short, q.defaultValue ?? '', 'Pre-filled answer',       false, 100)),
      row(ti('description', 'Description (below label)', TextInputStyle.Short, q.description  ?? '', 'Extra help text',         false, 256)),
    );
}

export function buildQLenModal(panelId: string, formId: string, idx: number, q: FormQuestion): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.qLenM(panelId, formId, idx))
    .setTitle('Edit Length Constraints')
    .addComponents(
      row(ti('minLength', 'Minimum Length (chars)', TextInputStyle.Short, String(q.minLength ?? 0),    '0 = no minimum', true, 4)),
      row(ti('maxLength', 'Maximum Length (chars)', TextInputStyle.Short, String(q.maxLength ?? 1000), 'Max 4000',        true, 4)),
    );
}

export function buildQValModal(panelId: string, formId: string, idx: number, q: FormQuestion): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.qValM(panelId, formId, idx))
    .setTitle('Edit Validation')
    .addComponents(
      row(ti('validationRegex', 'Validation Regex (optional)', TextInputStyle.Short,
        q.validationRegex ?? '', 'e.g. ^[A-Z]{3}-\\d+$  (empty = disabled)', false, 500)),
      row(ti('errorMessage',    'Error Message (optional)',    TextInputStyle.Short,
        q.errorMessage ?? '', 'Shown when validation fails', false, 256)),
    );
}

export function buildQCondValueModal(panelId: string, formId: string, idx: number, srcQId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TP.FRM.qCondM(panelId, formId, idx, srcQId))
    .setTitle('Set Condition Value')
    .addComponents(
      row(ti('equals', truncate(`Show if "${srcQId}" equals…`, 45), TextInputStyle.Short,
        '', 'Value to match (case-insensitive)', true, 200)),
    );
}
