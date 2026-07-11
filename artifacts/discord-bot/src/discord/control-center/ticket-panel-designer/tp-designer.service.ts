import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
  type Guild,
  type GuildMember,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type Interaction,
  type TextChannel,
} from 'discord.js';
import { panelManager } from '../../../community/tickets/panel-manager';
import { statisticsEngine } from '../../../community/tickets/statistics-engine';
import { templateEngine } from '../../../community/tickets/template-engine';
import { buildFormFromTemplate, type FormTemplateKey } from '../../../community/tickets/form-templates';
import { questionEngine, MAX_QUESTIONS_PER_FORM } from '../../../community/tickets/question-engine';
import { genId } from '../../../community/tickets/store';
import type { PermissionManager } from '../../../ai/permission-manager';
import type { TicketPanel, TicketButtonConfig, TicketSelectMenuOption, TicketPriority, TicketMemberPermConfig, TicketStaffPermConfig, TicketClaimBehaviourConfig, TicketVisibilityMode, TicketForm, FormQuestion, FormNextRule, QuestionType, TicketEntryRef, TicketTypeOverrides, TicketEmbedConfig } from '../../../community/tickets/types';
import { normalizePanel, DEFAULT_MEMBER_PERMS, DEFAULT_STAFF_PERMS, DEFAULT_CLAIM_BEHAVIOUR, QUESTION_TYPES, getEntry, setEntryOverrides } from '../../../community/tickets/types';
import {
  buildPDMain,
  buildPDSupportTeam,
  buildPDMemberPerms,
  buildPDStaffPerms,
  buildPDVisibility,
  buildPDClaim,
  buildPDPreview,
  buildPDEditModal,
} from './tp-permission-designer';
import { CC } from '../cc-ids';
import { truncate } from '../cc-categories';
import { assertUniqueCustomIds } from '../cc-debug';
import { logger } from '../../../utils/logger';
import { TP, type SectionKey } from './tp-ids';
import {
  buildPanelList,
  buildPanelDashboard,
  buildGeneralSection,
  buildAppearanceSection,
  buildButtonSection,
  buildPermissionsSection,
  buildCategoriesSection,
  buildNamingSection,
  buildLifecycleSection,
  buildAutomationSection,
  buildTranscriptsSection,
  buildStatsSection,
  buildPublishSection,
  buildPreviewSection,
  buildDeleteConfirm,
  buildExtraButtonDetail,
  buildSmOptionDetail,
  buildTTMain,
  buildTTCategories,
  buildTTRoles,
  buildTTNaming,
  buildTTEmbed,
  buildFeedback,
  buildTemplateGallery,
  buildTemplateDetail,
  buildTplDeleteConfirm,
  buildUseTplModal,
  buildSaveAsTplModal,
  TEMPLATES_PER_PAGE,
  buildCreatePanelModal,
  buildEditGeneralModal,
  buildEditEmbedModal,
  buildEditMediaModal,
  buildEditCategoriesModal,
  buildEditNamingModal,
  buildEditLifecycleModal,
  buildEditAutomationModal,
  buildEditTranscriptsModal,
  buildEditStaffRolesModal,
  buildEditAccessRolesModal,
  buildEditLogChannelModal,
  buildTTEditCategoriesModal,
  buildTTEditRolesModal,
  buildTTEditNamingModal,
  buildTTEditEmbedModal,
  buildTTEditEmbedMediaModal,
  buildPrimaryButtonModal,
  buildExtraButtonModal,
  buildSmOptionModal,
  buildSmPlaceholderModal,
  buildPublishChannelModal,
  buildFormBuilderMain,
  buildFormNewGallery,
  buildFormDetail,
  buildFormDeleteConfirm,
  buildFormChainView,
  buildFormAssignView,
  buildQAddTypePicker,
  buildQFrmDetail,
  buildQCondView,
  buildFormRenameModal,
  buildFormChainModal,
  buildFormImportModal,
  buildQAddModal,
  buildQBasicModal,
  buildQLenModal,
  buildQValModal,
  buildQCondValueModal,
  PANELS_PER_PAGE,
} from './tp-renderer';
import type { CCPayload } from '../cc-renderer';

type NavInteraction = ButtonInteraction | StringSelectMenuInteraction;

const UNKNOWN_INTERACTION  = 10062;
const ALREADY_ACKNOWLEDGED = 40060;

function isStale(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return code === UNKNOWN_INTERACTION || code === ALREADY_ACKNOWLEDGED;
  }
  return false;
}

function parseIds(raw: string): string[] {
  return raw.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s));
}

function parseColor(hex: string): number | null {
  const clean = hex.replace('#', '').trim();
  const n = parseInt(clean, 16);
  return isNaN(n) || n < 0 || n > 0xffffff ? null : n;
}

function parseIntSafe(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw.trim(), 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseBool(raw: string): boolean {
  return raw.trim().toLowerCase() === 'true' || raw.trim() === '1';
}

function getField(interaction: ModalSubmitInteraction, key: string, required = false): string {
  try {
    return interaction.fields.getTextInputValue(key).trim();
  } catch {
    if (required) throw new Error(`Required field "${key}" not found in modal.`);
    return '';
  }
}

export class TicketPanelDesigner {
  constructor(private readonly permissionManager: PermissionManager) {}

  // ── Entry point ─────────────────────────────────────────────────────────────

  async handleInteraction(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
    guild: Guild,
  ): Promise<void> {
    if (!this.isAdmin(interaction)) {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Admin access required.', flags: MessageFlags.Ephemeral });
      }
      return;
    }

    try {
      if (interaction.isButton()) {
        await this.routeButton(interaction, guild);
      } else if (interaction.isStringSelectMenu()) {
        await this.routeSelectMenu(interaction, guild);
      } else if (interaction.isModalSubmit()) {
        await this.routeModal(interaction, guild);
      }
    } catch (err) {
      if (isStale(err)) {
        logger.info('[TPD] Stale interaction dropped');
        return;
      }
      logger.error('[TPD] Interaction error', err);
      await this.safeError(interaction, err);
    }
  }

  // ── Button routing ──────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === TP.LIST) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    if (id.startsWith('tp:list:')) {
      await this.navPanelList(interaction, guild, parseIntSafe(id.slice('tp:list:'.length), 0, 999999, 0));
      return;
    }
    if (id === TP.NEW) {
      await interaction.showModal(buildCreatePanelModal());
      return;
    }
    if (id === TP.GALLERY) {
      await this.navTemplateGallery(interaction, guild, 0);
      return;
    }
    if (id.startsWith('tp:tpl:detail:')) {
      await this.navTemplateDetail(interaction, guild, id.slice('tp:tpl:detail:'.length));
      return;
    }
    if (id.startsWith('tp:tpl:use:')) {
      const tplId = id.slice('tp:tpl:use:'.length);
      const tpl = await templateEngine.get(tplId);
      if (!tpl) { await this.navTemplateGallery(interaction, guild, 0); return; }
      await interaction.showModal(buildUseTplModal(tpl));
      return;
    }
    if (id.startsWith('tp:tpl:save:')) {
      const panelId = id.slice('tp:tpl:save:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildSaveAsTplModal(panel));
      return;
    }
    if (id.startsWith('tp:tpl:del:yes:')) {
      await this.handleTplDeleteConfirmed(interaction, guild, id.slice('tp:tpl:del:yes:'.length));
      return;
    }
    if (id.startsWith('tp:tpl:del:')) {
      await this.navTplDeleteConfirm(interaction, guild, id.slice('tp:tpl:del:'.length));
      return;
    }
    if (id.startsWith('tp:dash:')) {
      await this.navDash(interaction, guild, id.slice('tp:dash:'.length));
      return;
    }
    if (id.startsWith('tp:section:')) {
      const parts = id.split(':');
      await this.navSection(interaction, guild, parts[2], parts[3] as SectionKey);
      return;
    }
    if (id.startsWith('tp:toggle:')) {
      const parts = id.split(':');
      const panelId = parts[2];
      const field   = parts.slice(3).join(':');
      await this.handleToggle(interaction, guild, panelId, field);
      return;
    }
    if (id.startsWith('tp:preview:')) {
      await this.navPreview(interaction, guild, id.slice('tp:preview:'.length));
      return;
    }
    if (id.startsWith('tp:del:yes:')) {
      await this.handleDeleteConfirmed(interaction, guild, id.slice('tp:del:yes:'.length));
      return;
    }
    if (id.startsWith('tp:del:')) {
      await this.navDeleteConfirm(interaction, guild, id.slice('tp:del:'.length));
      return;
    }
    if (id.startsWith('tp:repub:')) {
      await this.handleRepublish(interaction, guild, id.slice('tp:repub:'.length));
      return;
    }
    if (id.startsWith('tp:edit:')) {
      const parts = id.split(':');
      const panelId = parts[2];
      const field   = parts.slice(3).join(':');
      await this.showEditModal(interaction, guild, panelId, field);
      return;
    }
    // Button section
    if (id.startsWith('tp:btn:primary:')) {
      await interaction.showModal(await this.buildPrimaryBtnModal(id.slice('tp:btn:primary:'.length)));
      return;
    }
    if (id.startsWith('tp:btn:add:')) {
      await interaction.showModal(buildExtraButtonModal(id.slice('tp:btn:add:'.length), null, TP.btnAddM(id.slice('tp:btn:add:'.length))));
      return;
    }
    if (id.startsWith('tp:btn:detail:')) {
      const parts = id.split(':');
      await this.navBtnDetail(interaction, guild, parts[3], parseInt(parts[4], 10));
      return;
    }
    if (id.startsWith('tp:btn:edit:')) {
      const parts = id.split(':');
      const panelId = parts[3];
      const idx     = parseInt(parts[4], 10);
      const panel = await panelManager.get(panelId);
      const existing = panel?.additionalButtons[idx] ?? null;
      await interaction.showModal(buildExtraButtonModal(panelId, existing, TP.btnEditM(panelId, idx)));
      return;
    }
    if (id.startsWith('tp:btn:rm:')) {
      const parts = id.split(':');
      await this.handleBtnRemove(interaction, guild, parts[3], parseInt(parts[4], 10));
      return;
    }
    // Select menu option section
    if (id.startsWith('tp:sm:add:')) {
      const panelId = id.slice('tp:sm:add:'.length);
      await interaction.showModal(buildSmOptionModal(panelId, null, TP.smAddM(panelId)));
      return;
    }
    if (id.startsWith('tp:sm:opt:')) {
      const parts = id.split(':');
      await this.navSmOpt(interaction, guild, parts[3], parseInt(parts[4], 10));
      return;
    }
    if (id.startsWith('tp:sm:edit:')) {
      const parts = id.split(':');
      const panelId = parts[3];
      const idx     = parseInt(parts[4], 10);
      const panel = await panelManager.get(panelId);
      const existing = panel?.selectMenu?.options[idx] ?? null;
      await interaction.showModal(buildSmOptionModal(panelId, existing, TP.smEditM(panelId, idx)));
      return;
    }
    if (id.startsWith('tp:sm:rm:')) {
      const parts = id.split(':');
      await this.handleSmOptRemove(interaction, guild, parts[3], parseInt(parts[4], 10));
      return;
    }
    // ── Form Builder (tp:frm:*) ──────────────────────────────────────────────
    if (id.startsWith('tp:frm:')) {
      await this.routeFRMButton(interaction, guild, id);
      return;
    }

    // ── Permission Designer (tp:pd:*) ────────────────────────────────────────
    if (id.startsWith('tp:pd:')) {
      await this.routePDButton(interaction, guild, id);
      return;
    }

    // ── Ticket Type Designer (tp:tt:*) ───────────────────────────────────────
    if (id.startsWith('tp:tt:')) {
      await this.routeTTButton(interaction, guild, id);
      return;
    }

    logger.warning(`[TPD] Unrouted button custom_id: ${id}`);
    await this.safeError(interaction, new Error('This button is not wired to a handler yet.'));
  }

  // ── Ticket Type Designer (tp:tt:*) ──────────────────────────────────────────
  //
  // Custom ID shapes:
  //   tp:tt:<panelId>:<ref>              — main settings hub (TP.TT.main)
  //   tp:tt:reset:<panelId>:<ref>:<key>  — clear overrides (TP.TT.reset)
  private static readonly TT_KNOWN_SECTIONS = new Set([
    'cat', 'roles', 'access', 'mperms', 'sperms', 'vis', 'claim', 'naming',
    'auto', 'tx', 'stats', 'embed', 'edit', 'modal', 'mperm', 'sperm', 'setvis', 'ctog', 'reset',
  ]);

  /** Which override keys each built Ticket Type Designer section owns — used by section-scoped "Reset to Panel Default". */
  private static readonly TT_SECTION_KEYS: Partial<Record<string, Array<keyof TicketTypeOverrides>>> = {
    cat:    ['openCategory', 'closedCategory', 'archiveCategory'],
    roles:  ['supportRoles', 'pingRoles'],
    naming: ['namingScheme'],
    embed:  ['ticketEmbed'],
  };

  private async routeTTButton(interaction: ButtonInteraction, guild: Guild, id: string): Promise<void> {
    const rest = id.slice('tp:tt:'.length);
    const segs = rest.split(':');
    logger.info(`[TPD][TT] received custom_id="${id}" guild=${guild.id}`);

    if (TicketPanelDesigner.TT_KNOWN_SECTIONS.has(segs[0])) {
      const section = segs[0];
      const panelId = segs[1];
      const ref     = segs[2];
      const extra   = segs[3]; // present for edit/reset (the target section)

      if (section === 'reset') {
        await this.handleTTReset(interaction, guild, panelId, ref, extra ?? 'all');
        return;
      }
      if (section === 'edit') {
        await this.showTTEditModal(interaction, guild, panelId, ref, extra);
        return;
      }
      if (section === 'cat')    { await this.navTTCategories(interaction, guild, panelId, ref); return; }
      if (section === 'roles')  { await this.navTTRoles(interaction, guild, panelId, ref); return; }
      if (section === 'naming') { await this.navTTNaming(interaction, guild, panelId, ref); return; }
      if (section === 'embed')  { await this.navTTEmbed(interaction, guild, panelId, ref); return; }
      if (section === 'ctog')   { await this.handleTTToggle(interaction, guild, panelId, ref, extra); return; }

      // Remaining per-field section editors (access/mperms/sperms/vis/claim/auto/tx/stats)
      // are not built yet — surface a clear, ephemeral message instead of a silent no-op.
      logger.info(`[TPD][TT] section="${section}" panelId=${panelId} ref=${ref} — not yet implemented`);
      await this.navTTMain(interaction, guild, panelId, ref, `Editing "${section}" from this hub isn't available yet — use Categories / Roles / Naming above, or "Clear All Overrides" to reset this type.`);
      return;
    }

    const [panelId, ref] = segs;
    await this.navTTMain(interaction, guild, panelId, ref);
  }

  private async navTTCategories(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    if (!getEntry(panel, ref)) { await this.nav(interaction, buildTTMain(panel, ref)); return; }
    await this.nav(interaction, buildTTCategories(panel, ref));
  }

  private async navTTRoles(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    if (!getEntry(panel, ref)) { await this.nav(interaction, buildTTMain(panel, ref)); return; }
    await this.nav(interaction, buildTTRoles(panel, ref));
  }

  private async navTTNaming(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    if (!getEntry(panel, ref)) { await this.nav(interaction, buildTTMain(panel, ref)); return; }
    await this.nav(interaction, buildTTNaming(panel, ref));
  }

  private async navTTEmbed(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    if (!getEntry(panel, ref)) { await this.nav(interaction, buildTTMain(panel, ref)); return; }
    await this.nav(interaction, buildTTEmbed(panel, ref));
  }

  /** `tp:tt:ctog:<panelId>:<ref>:<field>` — toggles a boolean field owned by a ticket type's overrides (currently only the welcome embed's timestamp). */
  private async handleTTToggle(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef, field: string | undefined): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    const entry = getEntry(panel, ref);
    if (!entry) { await this.nav(interaction, buildTTMain(panel, ref)); return; }

    const next: TicketTypeOverrides = { ...(entry.overrides ?? {}) };
    if (field === 'embedTimestamp') {
      const te: Partial<TicketEmbedConfig> = { ...(next.ticketEmbed ?? {}) };
      te.showTimestamp = !te.showTimestamp;
      next.ticketEmbed = te;
    }

    await panelManager.update(panelId, setEntryOverrides(panel, ref, next));
    const updated = await panelManager.get(panelId);
    await this.nav(interaction, buildTTEmbed(updated ?? panel, ref));
  }

  private async showTTEditModal(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef, section: string | undefined): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await interaction.reply({ content: '❌ Panel not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!getEntry(panel, ref)) {
      await interaction.reply({ content: '❌ This button/option no longer exists on this panel.', flags: MessageFlags.Ephemeral });
      return;
    }

    switch (section) {
      case 'cat':        await interaction.showModal(buildTTEditCategoriesModal(panel, ref)); break;
      case 'roles':      await interaction.showModal(buildTTEditRolesModal(panel, ref)); break;
      case 'naming':     await interaction.showModal(buildTTEditNamingModal(panel, ref)); break;
      case 'embed':      await interaction.showModal(buildTTEditEmbedModal(panel, ref)); break;
      case 'embedmedia': await interaction.showModal(buildTTEditEmbedMediaModal(panel, ref)); break;
      default:
        await interaction.reply({ content: `❌ Editing "${section}" isn't available yet for individual ticket types.`, flags: MessageFlags.Ephemeral });
    }
  }

  private async navTTMain(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef, notice?: string): Promise<void> {
    logger.info(`[TPD][TT] navTTMain entered — panelId=${panelId} ref=${ref}`);
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      logger.warning(`[TPD][TT] panel not found or guild mismatch — panelId=${panelId}`);
      await this.navPanelList(interaction, guild, 0);
      return;
    }

    const entry = getEntry(panel, ref);
    if (!entry) {
      logger.warning(`[TPD][TT] entry not found for ref="${ref}" on panel=${panelId} — likely stale (entry removed)`);
      await this.nav(interaction, buildTTMain(panel, ref));
      return;
    }

    logger.info(`[TPD][TT] entered — panel="${panel.name}" ticketType="${entry.ticketType}" ref=${ref}`);
    const payload = buildTTMain(panel, ref);
    if (notice) payload.content = `ℹ️ ${notice}`;
    await this.nav(interaction, payload);
  }

  private async handleTTReset(interaction: ButtonInteraction, guild: Guild, panelId: string, ref: TicketEntryRef, section: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    const entry = getEntry(panel, ref);
    if (!entry) {
      logger.warning(`[TPD][TT] reset requested for missing entry ref="${ref}" on panel=${panelId}`);
      await this.nav(interaction, buildTTMain(panel, ref));
      return;
    }

    let nextOverrides: TicketTypeOverrides;
    if (section === 'all') {
      nextOverrides = {};
    } else {
      const keys = TicketPanelDesigner.TT_SECTION_KEYS[section];
      nextOverrides = { ...(entry.overrides ?? {}) };
      if (keys) for (const k of keys) delete nextOverrides[k];
    }

    await panelManager.update(panelId, setEntryOverrides(panel, ref, nextOverrides));
    const updated = await panelManager.get(panelId);

    let payload: CCPayload;
    switch (section) {
      case 'cat':    payload = buildTTCategories(updated ?? panel, ref); break;
      case 'roles':  payload = buildTTRoles(updated ?? panel, ref); break;
      case 'naming': payload = buildTTNaming(updated ?? panel, ref); break;
      case 'embed':  payload = buildTTEmbed(updated ?? panel, ref); break;
      default:       payload = buildTTMain(updated ?? panel, ref); break;
    }
    payload.content = section === 'all'
      ? '✅ Overrides cleared — this ticket type now inherits all panel defaults.'
      : '✅ Reset — this setting now inherits the panel default.';
    await this.nav(interaction, payload);
  }

  private async handleTTModalSubmit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, ref: TicketEntryRef, section: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }
    const entry = getEntry(panel, ref);
    if (!entry) {
      await this.navReply(interaction, buildFeedback(false, 'This button/option no longer exists on this panel.'));
      return;
    }

    const next: TicketTypeOverrides = { ...(entry.overrides ?? {}) };

    try {
      switch (section) {
        case 'cat': {
          const openCategory    = getField(interaction, 'openCategory',    false);
          const closedCategory  = getField(interaction, 'closedCategory',  false);
          const archiveCategory = getField(interaction, 'archiveCategory', false);
          if (openCategory)    next.openCategory    = openCategory;    else delete next.openCategory;
          if (closedCategory)  next.closedCategory  = closedCategory;  else delete next.closedCategory;
          if (archiveCategory) next.archiveCategory = archiveCategory; else delete next.archiveCategory;
          break;
        }
        case 'roles': {
          const supportRaw = getField(interaction, 'supportRoles', false);
          const pingRaw    = getField(interaction, 'pingRoles',    false);
          if (supportRaw) next.supportRoles = parseIds(supportRaw); else delete next.supportRoles;
          if (pingRaw)    next.pingRoles    = parseIds(pingRaw);    else delete next.pingRoles;
          break;
        }
        case 'naming': {
          const namingScheme = getField(interaction, 'namingScheme', false);
          if (namingScheme) next.namingScheme = namingScheme; else delete next.namingScheme;
          break;
        }
        case 'embed': {
          const title       = getField(interaction, 'title',       false);
          const description = getField(interaction, 'description', false);
          const colorRaw    = getField(interaction, 'color',       false);
          const footer      = getField(interaction, 'footer',      false);
          const author      = getField(interaction, 'author',      false);
          let color: number | undefined;
          if (colorRaw) {
            const parsed = parseColor(colorRaw);
            if (parsed === null) throw new Error(`Invalid hex color: "${colorRaw}". Use format 5865F2 or #5865F2.`);
            color = parsed;
          }
          // Each field is independent — only the fields present in THIS modal (title/description/
          // color/footer/author) are touched; thumbnail/banner from the media modal are preserved.
          const te: Partial<TicketEmbedConfig> = { ...(next.ticketEmbed ?? {}) };
          if (title)               te.title = title;             else delete te.title;
          if (description)         te.description = description; else delete te.description;
          if (color !== undefined) te.color = color;              else delete te.color;
          if (footer)               te.footer = footer;            else delete te.footer;
          if (author)               te.author = author;            else delete te.author;
          if (Object.keys(te).length > 0) next.ticketEmbed = te; else delete next.ticketEmbed;
          break;
        }
        case 'embedmedia': {
          const thumbnail = getField(interaction, 'thumbnail', false);
          const banner    = getField(interaction, 'banner',    false);
          const te: Partial<TicketEmbedConfig> = { ...(next.ticketEmbed ?? {}) };
          if (thumbnail) te.thumbnail = thumbnail; else delete te.thumbnail;
          if (banner)    te.banner = banner;       else delete te.banner;
          if (Object.keys(te).length > 0) next.ticketEmbed = te; else delete next.ticketEmbed;
          break;
        }
        default:
          throw new Error(`Unknown ticket type section: "${section}"`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid input.';
      await this.navReply(interaction, buildFeedback(false, message, panelId));
      return;
    }

    await panelManager.update(panelId, setEntryOverrides(panel, ref, next));
    const updated = await panelManager.get(panelId);
    logger.info(`[TPD][TT] updated overrides section="${section}" panelId=${panelId} ref=${ref}`);

    let payload: CCPayload;
    switch (section) {
      case 'cat':    payload = buildTTCategories(updated ?? panel, ref); break;
      case 'roles':  payload = buildTTRoles(updated ?? panel, ref); break;
      case 'naming': payload = buildTTNaming(updated ?? panel, ref); break;
      case 'embed':
      case 'embedmedia': payload = buildTTEmbed(updated ?? panel, ref); break;
      default:       payload = buildTTMain(updated ?? panel, ref); break;
    }
    await this.navReply(interaction, payload);
  }

  private async routePDButton(interaction: ButtonInteraction, guild: Guild, id: string): Promise<void> {
    // tp:pd:mperms:<panelId>
    if (id.startsWith('tp:pd:mperms:')) {
      const panelId = id.slice('tp:pd:mperms:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await this.nav(interaction, buildPDMemberPerms(panel));
      return;
    }
    // tp:pd:sperms:<panelId>
    if (id.startsWith('tp:pd:sperms:')) {
      const panelId = id.slice('tp:pd:sperms:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await this.nav(interaction, buildPDStaffPerms(panel));
      return;
    }
    // tp:pd:team:<panelId>
    if (id.startsWith('tp:pd:team:')) {
      const panelId = id.slice('tp:pd:team:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await this.nav(interaction, buildPDSupportTeam(panel));
      return;
    }
    // tp:pd:vis:<panelId>  (visibility page — not setvis)
    if (id.startsWith('tp:pd:vis:') && !id.startsWith('tp:pd:setvis:')) {
      const panelId = id.slice('tp:pd:vis:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await this.nav(interaction, buildPDVisibility(panel));
      return;
    }
    // tp:pd:claim:<panelId>
    if (id.startsWith('tp:pd:claim:') && !id.startsWith('tp:pd:ctog:')) {
      const panelId = id.slice('tp:pd:claim:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await this.nav(interaction, buildPDClaim(panel));
      return;
    }
    // tp:pd:prev:<panelId>
    if (id.startsWith('tp:pd:prev:')) {
      const panelId = id.slice('tp:pd:prev:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await this.nav(interaction, buildPDPreview(panel));
      return;
    }
    // tp:pd:edit:<panelId>:<section>  — opens modal
    if (id.startsWith('tp:pd:edit:')) {
      const rest    = id.slice('tp:pd:edit:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const section = rest.slice(colon + 1);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) {
        await interaction.reply({ content: '❌ Panel not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = buildPDEditModal(panel, section);
      if (!modal) {
        await interaction.reply({ content: `❌ Unknown section: \`${section}\``, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(modal);
      return;
    }
    // tp:pd:mperm:<panelId>:<key>  — toggle member permission
    if (id.startsWith('tp:pd:mperm:')) {
      const rest    = id.slice('tp:pd:mperm:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const key     = rest.slice(colon + 1) as keyof TicketMemberPermConfig;
      await this.handlePDMpermToggle(interaction, guild, panelId, key);
      return;
    }
    // tp:pd:sperm:<panelId>:<key>  — toggle staff permission
    if (id.startsWith('tp:pd:sperm:')) {
      const rest    = id.slice('tp:pd:sperm:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const key     = rest.slice(colon + 1) as keyof TicketStaffPermConfig;
      await this.handlePDSpermToggle(interaction, guild, panelId, key);
      return;
    }
    // tp:pd:setvis:<panelId>:<mode>  — set visibility mode
    if (id.startsWith('tp:pd:setvis:')) {
      const rest    = id.slice('tp:pd:setvis:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const mode    = rest.slice(colon + 1) as TicketVisibilityMode;
      await this.handlePDSetVisibility(interaction, guild, panelId, mode);
      return;
    }
    // tp:pd:ctog:<panelId>:<field>  — toggle claim behaviour field
    if (id.startsWith('tp:pd:ctog:')) {
      const rest    = id.slice('tp:pd:ctog:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const field   = rest.slice(colon + 1) as keyof TicketClaimBehaviourConfig;
      await this.handlePDClaimToggle(interaction, guild, panelId, field);
      return;
    }
    // tp:pd:<panelId>  — PD main page (must come last — least specific)
    const panelId = id.slice('tp:pd:'.length);
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    await this.nav(interaction, buildPDMain(panel));
  }

  // ── Form Builder (tp:frm:*) button routing ──────────────────────────────────

  private async routeFRMButton(interaction: ButtonInteraction, guild: Guild, id: string): Promise<void> {
    if (id.startsWith('tp:frm:new:use:')) {
      const rest = id.slice('tp:frm:new:use:'.length);
      const colon = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const tplKey = rest.slice(colon + 1) as FormTemplateKey;
      await this.handleFrmNewUse(interaction, guild, panelId, tplKey);
      return;
    }
    if (id.startsWith('tp:frm:new:')) {
      await this.navFrmNewGallery(interaction, guild, id.slice('tp:frm:new:'.length));
      return;
    }
    if (id.startsWith('tp:frm:detail:')) {
      const [panelId, formId] = id.slice('tp:frm:detail:'.length).split(':');
      await this.navFrmDetail(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:rename:')) {
      const [panelId, formId] = id.slice('tp:frm:rename:'.length).split(':');
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      if (!panel || panel.guildId !== guild.id || !form) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildFormRenameModal(panel, form));
      return;
    }
    if (id.startsWith('tp:frm:dup:')) {
      const [panelId, formId] = id.slice('tp:frm:dup:'.length).split(':');
      await this.handleFrmDuplicate(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:del:yes:')) {
      const [panelId, formId] = id.slice('tp:frm:del:yes:'.length).split(':');
      await this.handleFrmDeleteConfirmed(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:del:')) {
      const [panelId, formId] = id.slice('tp:frm:del:'.length).split(':');
      await this.navFrmDeleteConfirm(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:preview:')) {
      const [panelId, formId] = id.slice('tp:frm:preview:'.length).split(':');
      await this.handleFrmPreview(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:export:')) {
      const [panelId, formId] = id.slice('tp:frm:export:'.length).split(':');
      await this.handleFrmExport(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:import:')) {
      const panelId = id.slice('tp:frm:import:'.length);
      const panel = await panelManager.get(panelId);
      if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildFormImportModal(panel));
      return;
    }
    if (id.startsWith('tp:frm:assign:')) {
      const [panelId, formId] = id.slice('tp:frm:assign:'.length).split(':');
      await this.navFrmAssign(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:chain:set:')) {
      const [panelId, formId] = id.slice('tp:frm:chain:set:'.length).split(':');
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      if (!panel || panel.guildId !== guild.id || !form) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildFormChainModal(panel, form));
      return;
    }
    if (id.startsWith('tp:frm:chain:')) {
      const [panelId, formId] = id.slice('tp:frm:chain:'.length).split(':');
      await this.navFrmChain(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:q:add:')) {
      const [panelId, formId] = id.slice('tp:frm:q:add:'.length).split(':');
      await this.navFrmQAddTypePicker(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:q:detail:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:detail:'.length).split(':');
      await this.navFrmQDetail(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:q:basic:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:basic:'.length).split(':');
      const idx = parseInt(idxStr, 10);
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      const q = form?.questions[idx];
      if (!panel || panel.guildId !== guild.id || !form || !q) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildQBasicModal(panelId, formId, idx, q));
      return;
    }
    if (id.startsWith('tp:frm:q:len:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:len:'.length).split(':');
      const idx = parseInt(idxStr, 10);
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      const q = form?.questions[idx];
      if (!panel || panel.guildId !== guild.id || !form || !q) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildQLenModal(panelId, formId, idx, q));
      return;
    }
    if (id.startsWith('tp:frm:q:val:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:val:'.length).split(':');
      const idx = parseInt(idxStr, 10);
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      const q = form?.questions[idx];
      if (!panel || panel.guildId !== guild.id || !form || !q) { await this.navPanelList(interaction, guild, 0); return; }
      await interaction.showModal(buildQValModal(panelId, formId, idx, q));
      return;
    }
    if (id.startsWith('tp:frm:q:req:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:req:'.length).split(':');
      await this.handleFrmQToggleRequired(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:q:up:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:up:'.length).split(':');
      await this.handleFrmQMove(interaction, guild, panelId, formId, parseInt(idxStr, 10), -1);
      return;
    }
    if (id.startsWith('tp:frm:q:down:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:down:'.length).split(':');
      await this.handleFrmQMove(interaction, guild, panelId, formId, parseInt(idxStr, 10), 1);
      return;
    }
    if (id.startsWith('tp:frm:q:rm:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:rm:'.length).split(':');
      await this.handleFrmQRemove(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:qc:clear:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:qc:clear:'.length).split(':');
      await this.handleFrmQCondClear(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:qc:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:qc:'.length).split(':');
      await this.navFrmQCondView(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }

    // tp:frm:<panelId>  — Form Builder main list (must come last — least specific)
    const mainPanelId = id.slice('tp:frm:'.length);
    await this.navSection(interaction, guild, mainPanelId, 'forms');
  }

  // ── Select menu routing ─────────────────────────────────────────────────────

  private async routeSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    const id    = interaction.customId;
    const value = interaction.values[0];

    if (id.startsWith('tp:ps:')) {
      // Panel list select — value is the panel ID
      await this.navDash(interaction, guild, value);
      return;
    }
    if (id.startsWith('tp:ebs:')) {
      // Extra buttons select — value is idx
      const panelId = id.slice('tp:ebs:'.length);
      await this.navBtnDetail(interaction, guild, panelId, parseInt(value, 10));
      return;
    }
    if (id.startsWith('tp:sos:')) {
      // SM option select — value is idx
      const panelId = id.slice('tp:sos:'.length);
      await this.navSmOpt(interaction, guild, panelId, parseInt(value, 10));
      return;
    }
    if (id.startsWith('tp:tgs:')) {
      // Template gallery select — value is the template ID
      await this.navTemplateDetail(interaction, guild, value);
      return;
    }
    // ── Form Builder select menus ──────────────────────────────────────────────
    if (id.startsWith('tp:frm:')) {
      await this.routeFRMSelectMenu(interaction, guild, id);
      return;
    }
  }

  private async routeFRMSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild, id: string): Promise<void> {
    const value = interaction.values[0];

    if (id.startsWith('tp:frm:q:addtype:')) {
      const [panelId, formId] = id.slice('tp:frm:q:addtype:'.length).split(':');
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      if (!panel || panel.guildId !== guild.id || !form) {
        await interaction.reply({ content: '❌ Form not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (form.questions.length >= MAX_QUESTIONS_PER_FORM) {
        await interaction.reply({ content: `❌ Maximum ${MAX_QUESTIONS_PER_FORM} questions per form (Discord limit).`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(buildQAddModal(panelId, formId, value));
      return;
    }
    if (id.startsWith('tp:frm:qc:pick:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:qc:pick:'.length).split(':');
      const idx = parseInt(idxStr, 10);
      const panel = await panelManager.get(panelId);
      const form = panel?.forms?.find(f => f.id === formId);
      if (!panel || panel.guildId !== guild.id || !form || !form.questions[idx]) {
        await interaction.reply({ content: '❌ Question not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(buildQCondValueModal(panelId, formId, idx, value));
      return;
    }
    if (id.startsWith('tp:frm:qs:')) {
      const [panelId, formId] = id.slice('tp:frm:qs:'.length).split(':');
      await this.navFrmQDetail(interaction, guild, panelId, formId, parseInt(value, 10));
      return;
    }
    if (id.startsWith('tp:frm:fs:')) {
      const panelId = id.slice('tp:frm:fs:'.length);
      await this.navFrmDetail(interaction, guild, panelId, value);
      return;
    }
    if (id.startsWith('tp:frm:assignsel:')) {
      const [panelId, formId] = id.slice('tp:frm:assignsel:'.length).split(':');
      await this.handleFrmAssignSelect(interaction, guild, panelId, formId, value);
      return;
    }
  }

  // ── Modal routing ───────────────────────────────────────────────────────────

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === TP.NEW_M) {
      await this.handleCreatePanel(interaction, guild);
      return;
    }
    if (id.startsWith('tp:pub:m:')) {
      await this.handlePublish(interaction, guild, id.slice('tp:pub:m:'.length));
      return;
    }
    if (id.startsWith('tp:btn:primary:m:')) {
      await this.handlePrimaryBtnEdit(interaction, guild, id.slice('tp:btn:primary:m:'.length));
      return;
    }
    if (id.startsWith('tp:btn:add:m:')) {
      await this.handleBtnAdd(interaction, guild, id.slice('tp:btn:add:m:'.length));
      return;
    }
    if (id.startsWith('tp:btn:edit:m:')) {
      const parts = id.slice('tp:btn:edit:m:'.length).split(':');
      const panelId = parts[0];
      const idx     = parseInt(parts[1], 10);
      await this.handleBtnEdit(interaction, guild, panelId, idx);
      return;
    }
    if (id.startsWith('tp:sm:add:m:')) {
      await this.handleSmOptAdd(interaction, guild, id.slice('tp:sm:add:m:'.length));
      return;
    }
    if (id.startsWith('tp:sm:edit:m:')) {
      const rest  = id.slice('tp:sm:edit:m:'.length);
      const colon = rest.lastIndexOf(':');
      const panelId = rest.slice(0, colon);
      const idx     = parseInt(rest.slice(colon + 1), 10);
      await this.handleSmOptEdit(interaction, guild, panelId, idx);
      return;
    }
    // Form Builder modal submits — must be checked before generic tp:modal:
    if (id.startsWith('tp:frm:rename:m:')) {
      const [panelId, formId] = id.slice('tp:frm:rename:m:'.length).split(':');
      await this.handleFrmRenameSubmit(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:chain:m:')) {
      const [panelId, formId] = id.slice('tp:frm:chain:m:'.length).split(':');
      await this.handleFrmChainSubmit(interaction, guild, panelId, formId);
      return;
    }
    if (id.startsWith('tp:frm:import:m:')) {
      const panelId = id.slice('tp:frm:import:m:'.length);
      await this.handleFrmImportSubmit(interaction, guild, panelId);
      return;
    }
    if (id.startsWith('tp:frm:q:add:m:')) {
      const [panelId, formId, type] = id.slice('tp:frm:q:add:m:'.length).split(':');
      await this.handleFrmQAddSubmit(interaction, guild, panelId, formId, type);
      return;
    }
    if (id.startsWith('tp:frm:q:basic:m:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:basic:m:'.length).split(':');
      await this.handleFrmQBasicSubmit(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:q:len:m:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:len:m:'.length).split(':');
      await this.handleFrmQLenSubmit(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:q:val:m:')) {
      const [panelId, formId, idxStr] = id.slice('tp:frm:q:val:m:'.length).split(':');
      await this.handleFrmQValSubmit(interaction, guild, panelId, formId, parseInt(idxStr, 10));
      return;
    }
    if (id.startsWith('tp:frm:qc:m:')) {
      const [panelId, formId, idxStr, srcQId] = id.slice('tp:frm:qc:m:'.length).split(':');
      await this.handleFrmQCondSubmit(interaction, guild, panelId, formId, parseInt(idxStr, 10), srcQId);
      return;
    }
    if (id.startsWith('tp:frm:prevmodal:')) {
      const [panelId, formId] = id.slice('tp:frm:prevmodal:'.length).split(':');
      await this.handleFrmPreviewSubmit(interaction, guild, panelId, formId);
      return;
    }

    // Permission Designer modal submits — must be checked before generic tp:modal:
    if (id.startsWith('tp:pd:modal:')) {
      const rest    = id.slice('tp:pd:modal:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const section = rest.slice(colon + 1);
      await this.handlePDModalSubmit(interaction, guild, panelId, section);
      return;
    }

    // Ticket Type Designer modal submits — must be checked before generic tp:modal:
    if (id.startsWith('tp:tt:modal:')) {
      const [panelId, ref, section] = id.slice('tp:tt:modal:'.length).split(':');
      await this.handleTTModalSubmit(interaction, guild, panelId, ref, section);
      return;
    }

    if (id.startsWith('tp:modal:')) {
      const rest    = id.slice('tp:modal:'.length);
      const colon   = rest.indexOf(':');
      const panelId = rest.slice(0, colon);
      const field   = rest.slice(colon + 1);
      await this.handleFieldModal(interaction, guild, panelId, field);
      return;
    }
    if (id.startsWith('tp:tpl:use:m:')) {
      await this.handleCreateFromTemplate(interaction, guild, id.slice('tp:tpl:use:m:'.length));
      return;
    }
    if (id.startsWith('tp:tpl:save:m:')) {
      await this.handleSaveAsTemplate(interaction, guild, id.slice('tp:tpl:save:m:'.length));
      return;
    }
  }

  // ── Navigation helpers ──────────────────────────────────────────────────────

  private async nav(interaction: NavInteraction, payload: CCPayload): Promise<void> {
    assertUniqueCustomIds('TPD:nav', payload);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async navReply(interaction: ModalSubmitInteraction, payload: CCPayload): Promise<void> {
    assertUniqueCustomIds('TPD:navReply', payload);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(payload);
  }

  private async navPanelList(interaction: NavInteraction, guild: Guild, offset: number): Promise<void> {
    const allPanels = await panelManager.list(guild.id, { includeArchived: false });
    const slice     = allPanels.slice(offset, offset + PANELS_PER_PAGE);
    await this.nav(interaction, buildPanelList(slice, offset, allPanels.length));
  }

  private async navDash(interaction: NavInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    await this.nav(interaction, buildPanelDashboard(panel));
  }

  private async navSection(interaction: NavInteraction, guild: Guild, panelId: string, key: SectionKey): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }

    let payload: CCPayload;
    switch (key) {
      case 'general':     payload = buildGeneralSection(panel); break;
      case 'appearance':  payload = buildAppearanceSection(panel); break;
      case 'button':      payload = buildButtonSection(panel); break;
      case 'permissions': payload = buildPermissionsSection(panel); break;
      case 'forms':       payload = buildFormBuilderMain(panel); break;
      case 'categories':  payload = buildCategoriesSection(panel); break;
      case 'naming':      payload = buildNamingSection(panel); break;
      case 'lifecycle':   payload = buildLifecycleSection(panel); break;
      case 'automation':  payload = buildAutomationSection(panel); break;
      case 'transcripts': payload = buildTranscriptsSection(panel); break;
      case 'stats': {
        const stats = await statisticsEngine.getDashboard(guild.id, panel.id);
        payload = buildStatsSection(panel, stats);
        break;
      }
      case 'publish': payload = buildPublishSection(panel); break;
      default:        payload = buildPanelDashboard(panel); break;
    }
    await this.nav(interaction, payload);
  }

  private async navPreview(interaction: NavInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    await this.nav(interaction, buildPreviewSection(panel));
  }

  private async navDeleteConfirm(interaction: NavInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    await this.nav(interaction, buildDeleteConfirm(panel));
  }

  private async navBtnDetail(interaction: NavInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.additionalButtons[idx]) {
      await this.navSection(interaction, guild, panelId, 'button');
      return;
    }
    await this.nav(interaction, buildExtraButtonDetail(panel, idx));
  }

  private async navSmOpt(interaction: NavInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.selectMenu?.options[idx]) {
      await this.navSection(interaction, guild, panelId, 'button');
      return;
    }
    await this.nav(interaction, buildSmOptionDetail(panel, idx));
  }

  // ── Toggle handlers ─────────────────────────────────────────────────────────

  private async handleToggle(interaction: NavInteraction, guild: Guild, panelId: string, field: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }

    let patch: Partial<TicketPanel>;

    switch (field) {
      case 'enabled':
        patch = { enabled: !panel.enabled };
        break;
      case 'timestamp':
        patch = { embed: { ...panel.embed, showTimestamp: !panel.embed.showTimestamp } };
        break;
      case 'selectmenu':
        patch = panel.selectMenu
          ? { selectMenu: undefined }
          : { selectMenu: { placeholder: 'Select a ticket type…', options: [] } };
        break;
      case 'modalenabled':
        patch = { modal: { ...panel.modal, enabled: !panel.modal.enabled } };
        break;
      case 'transcriptenabled':
        patch = { transcript: { ...panel.transcript, enabled: !panel.transcript.enabled } };
        break;
      case 'trackresponse':
        patch = { statistics: { ...panel.statistics, trackResponseTime: !panel.statistics.trackResponseTime } };
        break;
      case 'trackclaims':
        patch = { statistics: { ...panel.statistics, trackClaims: !panel.statistics.trackClaims } };
        break;
      default:
        patch = {};
    }

    const updated = await panelManager.update(panelId, patch);
    if (!updated) {
      await this.nav(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }
    await this.nav(interaction, buildPanelDashboard(updated));
  }

  // ── Edit modal triggers ─────────────────────────────────────────────────────

  private async showEditModal(interaction: ButtonInteraction, _guild: Guild, panelId: string, field: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel) {
      await interaction.reply({ content: '❌ Panel not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    switch (field) {
      case 'general':      await interaction.showModal(buildEditGeneralModal(panel)); break;
      case 'embed':        await interaction.showModal(buildEditEmbedModal(panel)); break;
      case 'media':        await interaction.showModal(buildEditMediaModal(panel)); break;
      case 'categories':   await interaction.showModal(buildEditCategoriesModal(panel)); break;
      case 'naming':       await interaction.showModal(buildEditNamingModal(panel)); break;
      case 'lifecycle':    await interaction.showModal(buildEditLifecycleModal(panel)); break;
      case 'automation':   await interaction.showModal(buildEditAutomationModal(panel)); break;
      case 'transcripts':  await interaction.showModal(buildEditTranscriptsModal(panel)); break;
      case 'staffroles':   await interaction.showModal(buildEditStaffRolesModal(panel)); break;
      case 'accessroles':  await interaction.showModal(buildEditAccessRolesModal(panel)); break;
      case 'logchannel':   await interaction.showModal(buildEditLogChannelModal(panel)); break;
      case 'smplaceholder': await interaction.showModal(buildSmPlaceholderModal(panel)); break;
      case 'publish':      await interaction.showModal(buildPublishChannelModal(panel)); break;
      default:
        await interaction.reply({ content: `❌ Unknown field: \`${field}\``, flags: MessageFlags.Ephemeral });
    }
  }

  private async buildPrimaryBtnModal(panelId: string): Promise<ReturnType<typeof buildPrimaryButtonModal>> {
    const panel = await panelManager.get(panelId);
    if (!panel) throw new Error('Panel not found');
    return buildPrimaryButtonModal(panel);
  }

  // ── Field modal submit handlers ─────────────────────────────────────────────

  private async handleCreatePanel(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const name        = getField(interaction, 'name',        true);
    const description = getField(interaction, 'description', false);
    const embedTitle  = getField(interaction, 'embedTitle',  true);
    const embedDesc   = getField(interaction, 'embedDesc',   true);
    const btnLabel    = getField(interaction, 'btnLabel',    true);

    const panel = await panelManager.create(guild.id, {
      name,
      description,
      channelId: '',
      embed: { title: embedTitle, description: embedDesc, color: 0x5865f2 },
      button: { label: btnLabel, style: 'Primary', ticketType: 'default' },
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
      namingScheme: 'ticket-{counter}',
      ticketLimit: 1,
      cooldown: 0,
      priority: 'normal',
      modal: { enabled: false, questions: [] },
      forms: [],
      transcript: { enabled: false, formats: ['html'], dmUser: false },
      automation: { autoCloseInactivityMinutes: 0, autoDeleteAfterCloseMinutes: 0, cooldownSeconds: 0, reminderMinutes: 0 },
      statistics: { trackResponseTime: true, trackClaims: true },
      enabled: true,
    });

    logger.info(`[TPD] Created panel "${panel.name}" (${panel.id}) in guild ${guild.id}`);
    await this.navReply(interaction, buildPanelDashboard(panel));
  }

  private async handleFieldModal(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, field: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }

    let patch: Partial<TicketPanel> = {};
    let sectionKey: SectionKey = 'general';

    try {
      switch (field) {
        case 'general': {
          const name        = getField(interaction, 'name', true);
          const description = getField(interaction, 'description', false);
          patch = { name, description };
          sectionKey = 'general';
          break;
        }
        case 'embed': {
          const title       = getField(interaction, 'title',       true);
          const description = getField(interaction, 'description', true);
          const colorRaw    = getField(interaction, 'color',       true);
          const footer      = getField(interaction, 'footer',      false);
          const author      = getField(interaction, 'author',      false);
          const color = parseColor(colorRaw);
          if (color === null) throw new Error(`Invalid hex color: "${colorRaw}". Use format 5865F2 or #5865F2.`);
          patch = { embed: { ...panel.embed, title, description, color, footer: footer || undefined, author: author || undefined } };
          sectionKey = 'appearance';
          break;
        }
        case 'media': {
          const thumbnail = getField(interaction, 'thumbnail', false);
          const banner    = getField(interaction, 'banner',    false);
          patch = { embed: { ...panel.embed, thumbnail: thumbnail || undefined, banner: banner || undefined } };
          sectionKey = 'appearance';
          break;
        }
        case 'categories': {
          const openCategory    = getField(interaction, 'openCategory',    false);
          const closedCategory  = getField(interaction, 'closedCategory',  false);
          const archiveCategory = getField(interaction, 'archiveCategory', false);
          patch = {
            openCategory:    openCategory    || undefined,
            closedCategory:  closedCategory  || undefined,
            archiveCategory: archiveCategory || undefined,
          };
          sectionKey = 'categories';
          break;
        }
        case 'naming': {
          const namingScheme = getField(interaction, 'namingScheme', true);
          patch = { namingScheme };
          sectionKey = 'naming';
          break;
        }
        case 'lifecycle': {
          const ticketLimit = parseIntSafe(getField(interaction, 'ticketLimit', true), 1, 50, 1);
          const cooldown    = parseIntSafe(getField(interaction, 'cooldown',    true), 0, 86400, 0);
          const priorityRaw = getField(interaction, 'priority', true).toLowerCase();
          const priority    = (['low', 'normal', 'high', 'urgent'].includes(priorityRaw) ? priorityRaw : 'normal') as TicketPriority;
          patch = { ticketLimit, cooldown, priority };
          sectionKey = 'lifecycle';
          break;
        }
        case 'automation': {
          patch = {
            automation: {
              autoCloseInactivityMinutes:  parseIntSafe(getField(interaction, 'autoCloseInactivityMinutes', true), 0, 43200, 0),
              autoDeleteAfterCloseMinutes: parseIntSafe(getField(interaction, 'autoDeleteAfterCloseMinutes', true), 0, 43200, 0),
              cooldownSeconds:             parseIntSafe(getField(interaction, 'cooldownSeconds', true), 0, 86400, 0),
              reminderMinutes:             parseIntSafe(getField(interaction, 'reminderMinutes', true), 0, 10080, 0),
            },
          };
          sectionKey = 'automation';
          break;
        }
        case 'transcripts': {
          const channelId = getField(interaction, 'channelId', false);
          const fmtRaw    = getField(interaction, 'formats', true);
          const dmUser    = parseBool(getField(interaction, 'dmUser', true));
          const formats   = fmtRaw.split(/[\s,]+/).map(s => s.trim()).filter(f => f === 'html' || f === 'markdown') as Array<'html' | 'markdown'>;
          patch = {
            transcript: {
              ...panel.transcript,
              channelId: channelId || undefined,
              formats: formats.length > 0 ? formats : ['html'],
              dmUser,
            },
          };
          sectionKey = 'transcripts';
          break;
        }
        case 'staffroles': {
          const supportRoles = parseIds(getField(interaction, 'supportRoles', false));
          const managerRoles = parseIds(getField(interaction, 'managerRoles', false));
          const pingRoles    = parseIds(getField(interaction, 'pingRoles',    false));
          patch = { supportRoles, managerRoles, pingRoles };
          sectionKey = 'permissions';
          break;
        }
        case 'accessroles': {
          const allowedRoles = parseIds(getField(interaction, 'allowedRoles', false));
          const blockedRoles = parseIds(getField(interaction, 'blockedRoles', false));
          patch = { allowedRoles, blockedRoles };
          sectionKey = 'permissions';
          break;
        }
        case 'logchannel': {
          const logChannelId = getField(interaction, 'logChannelId', false);
          patch = { logChannelId: logChannelId || undefined };
          sectionKey = 'permissions';
          break;
        }
        case 'smplaceholder': {
          const placeholder = getField(interaction, 'placeholder', false);
          patch = { selectMenu: { ...(panel.selectMenu ?? { options: [] }), placeholder: placeholder || undefined } };
          sectionKey = 'button';
          break;
        }
        default:
          throw new Error(`Unknown field: "${field}"`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid input.';
      await this.navReply(interaction, buildFeedback(false, message, panelId));
      return;
    }

    const updated = await panelManager.update(panelId, patch);
    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to save changes.', panelId));
      return;
    }

    logger.info(`[TPD] Updated panel ${panelId} field="${field}"`);
    const updatedPanel = updated;
    let payload: CCPayload;
    switch (sectionKey) {
      case 'appearance':   payload = buildAppearanceSection(updatedPanel); break;
      case 'button':       payload = buildButtonSection(updatedPanel); break;
      case 'permissions':  payload = buildPermissionsSection(updatedPanel); break;
      case 'categories':   payload = buildCategoriesSection(updatedPanel); break;
      case 'naming':       payload = buildNamingSection(updatedPanel); break;
      case 'lifecycle':    payload = buildLifecycleSection(updatedPanel); break;
      case 'automation':   payload = buildAutomationSection(updatedPanel); break;
      case 'transcripts':  payload = buildTranscriptsSection(updatedPanel); break;
      default:             payload = buildGeneralSection(updatedPanel); break;
    }
    await this.navReply(interaction, payload);
  }

  // ── Primary button edit ─────────────────────────────────────────────────────

  private async handlePrimaryBtnEdit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }

    const label      = getField(interaction, 'label',      true);
    const styleRaw   = getField(interaction, 'style',      true);
    const emoji      = getField(interaction, 'emoji',      false);
    const ticketType = getField(interaction, 'ticketType', true);
    const categoryId = getField(interaction, 'categoryId', false);

    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    const style = validStyles.find(s => s.toLowerCase() === styleRaw.toLowerCase()) ?? 'Primary';

    const updated = await panelManager.update(panelId, {
      button: { ...panel.button, label, style: style as TicketButtonConfig['style'], emoji: emoji || undefined, ticketType, categoryId: categoryId || undefined },
    });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to save.', panelId));
      return;
    }

    await this.navReply(interaction, buildButtonSection(updated));
  }

  // ── Extra button handlers ───────────────────────────────────────────────────

  private async handleBtnAdd(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }
    if (panel.additionalButtons.length >= 4) {
      await this.navReply(interaction, buildFeedback(false, 'Maximum 4 extra buttons (5 total).', panelId));
      return;
    }

    const label      = getField(interaction, 'label',      true);
    const styleRaw   = getField(interaction, 'style',      true);
    const emoji      = getField(interaction, 'emoji',      false);
    const ticketType = getField(interaction, 'ticketType', true);
    const categoryId = getField(interaction, 'categoryId', false);

    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    const style = validStyles.find(s => s.toLowerCase() === styleRaw.toLowerCase()) ?? 'Primary';

    const newBtn: TicketButtonConfig = { label, style: style as TicketButtonConfig['style'], emoji: emoji || undefined, ticketType, categoryId: categoryId || undefined };
    const updated = await panelManager.update(panelId, { additionalButtons: [...panel.additionalButtons, newBtn] });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to add button.', panelId));
      return;
    }
    await this.navReply(interaction, buildButtonSection(updated));
  }

  private async handleBtnEdit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.additionalButtons[idx]) {
      await this.navReply(interaction, buildFeedback(false, 'Button not found.', panelId));
      return;
    }

    const label      = getField(interaction, 'label',      true);
    const styleRaw   = getField(interaction, 'style',      true);
    const emoji      = getField(interaction, 'emoji',      false);
    const ticketType = getField(interaction, 'ticketType', true);
    const categoryId = getField(interaction, 'categoryId', false);

    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    const style = validStyles.find(s => s.toLowerCase() === styleRaw.toLowerCase()) ?? 'Primary';

    const newButtons = [...panel.additionalButtons];
    newButtons[idx] = { ...newButtons[idx], label, style: style as TicketButtonConfig['style'], emoji: emoji || undefined, ticketType, categoryId: categoryId || undefined };
    const updated = await panelManager.update(panelId, { additionalButtons: newButtons });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to update button.', panelId));
      return;
    }
    await this.navReply(interaction, buildButtonSection(updated));
  }

  private async handleBtnRemove(interaction: NavInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    const newButtons = panel.additionalButtons.filter((_, i) => i !== idx);
    const updated = await panelManager.update(panelId, { additionalButtons: newButtons });
    await this.nav(interaction, buildButtonSection(updated ?? panel));
  }

  // ── Select menu option handlers ─────────────────────────────────────────────

  private async handleSmOptAdd(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }
    const currentOpts = panel.selectMenu?.options ?? [];
    if (currentOpts.length >= 25) {
      await this.navReply(interaction, buildFeedback(false, 'Maximum 25 select menu options reached.', panelId));
      return;
    }

    const label       = getField(interaction, 'label',       true);
    const ticketType  = getField(interaction, 'ticketType',  true);
    const description = getField(interaction, 'description', false);
    const emoji       = getField(interaction, 'emoji',       false);
    const categoryId  = getField(interaction, 'categoryId',  false);

    const newOpt: TicketSelectMenuOption = { label, value: ticketType, ticketType, description: description || undefined, emoji: emoji || undefined, categoryId: categoryId || undefined };
    const newMenu = { placeholder: panel.selectMenu?.placeholder, options: [...currentOpts, newOpt] };
    const updated = await panelManager.update(panelId, { selectMenu: newMenu });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to add option.', panelId));
      return;
    }
    await this.navReply(interaction, buildButtonSection(updated));
  }

  private async handleSmOptEdit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.selectMenu?.options[idx]) {
      await this.navReply(interaction, buildFeedback(false, 'Option not found.', panelId));
      return;
    }

    const label       = getField(interaction, 'label',       true);
    const ticketType  = getField(interaction, 'ticketType',  true);
    const description = getField(interaction, 'description', false);
    const emoji       = getField(interaction, 'emoji',       false);
    const categoryId  = getField(interaction, 'categoryId',  false);

    const newOpts = [...panel.selectMenu.options];
    newOpts[idx] = { ...newOpts[idx], label, value: ticketType, ticketType, description: description || undefined, emoji: emoji || undefined, categoryId: categoryId || undefined };
    const updated = await panelManager.update(panelId, { selectMenu: { ...panel.selectMenu, options: newOpts } });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to update option.', panelId));
      return;
    }
    await this.navReply(interaction, buildButtonSection(updated));
  }

  private async handleSmOptRemove(interaction: NavInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.selectMenu) {
      await this.navSection(interaction, guild, panelId, 'button');
      return;
    }
    const newOpts = panel.selectMenu.options.filter((_, i) => i !== idx);
    const updated = await panelManager.update(panelId, { selectMenu: { ...panel.selectMenu, options: newOpts } });
    await this.nav(interaction, buildButtonSection(updated ?? panel));
  }

  // ── Publish handlers ────────────────────────────────────────────────────────

  private async handlePublish(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }

    const channelId = getField(interaction, 'channelId', true);

    let patched = panel;
    if (channelId !== panel.channelId) {
      const p = await panelManager.update(panelId, { channelId, messageId: undefined });
      if (!p) {
        await this.navReply(interaction, buildFeedback(false, 'Failed to update channel.', panelId));
        return;
      }
      patched = p;
    }

    try {
      const published = await panelManager.publish(guild, patched);
      logger.info(`[TPD] Published panel ${panelId} to channel ${channelId}`);
      await this.navReply(interaction, buildFeedback(true, `✅ Panel published to <#${channelId}>!\nMessage ID: \`${published.messageId}\``, panelId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed.';
      await this.navReply(interaction, buildFeedback(false, msg, panelId));
    }
  }

  private async handleRepublish(interaction: NavInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.channelId || !panel.messageId) {
      await this.navSection(interaction, guild, panelId, 'publish');
      return;
    }

    try {
      const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
      if (!channel?.isTextBased()) throw new Error('Channel not found or not text-based.');

      const msg = await (channel as TextChannel).messages.fetch(panel.messageId).catch(() => null);
      const preview = panelManager.preview(panel);
      const editPayload = { embeds: preview.embeds ?? [], components: preview.components ?? [] };

      if (msg) {
        await msg.edit(editPayload);
      } else {
        const newMsg = await (channel as TextChannel).send(preview);
        await panelManager.update(panelId, { messageId: newMsg.id });
      }

      logger.info(`[TPD] Republished panel ${panelId}`);
      await this.nav(interaction, buildFeedback(true, `✅ Panel updated in <#${panel.channelId}>.`, panelId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Republish failed.';
      await this.nav(interaction, buildFeedback(false, msg, panelId));
    }
  }

  // ── Delete handler ──────────────────────────────────────────────────────────

  private async handleDeleteConfirmed(interaction: NavInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navPanelList(interaction, guild, 0);
      return;
    }
    const name = panel.name;
    await panelManager.delete(panelId);
    logger.info(`[TPD] Deleted panel "${name}" (${panelId}) from guild ${guild.id}`);
    const allPanels = await panelManager.list(guild.id);
    await this.nav(interaction, buildPanelList(allPanels.slice(0, PANELS_PER_PAGE), 0, allPanels.length));
  }

  // ── Template Gallery navigation ─────────────────────────────────────────────

  private async navTemplateGallery(interaction: NavInteraction, _guild: Guild, offset: number): Promise<void> {
    const all = await templateEngine.list();
    const slice = all.slice(offset, offset + TEMPLATES_PER_PAGE);
    await this.nav(interaction, buildTemplateGallery(slice, offset, all.length));
  }

  private async navTemplateDetail(interaction: NavInteraction, _guild: Guild, tplId: string): Promise<void> {
    const tpl = await templateEngine.get(tplId);
    if (!tpl) {
      const all = await templateEngine.list();
      await this.nav(interaction, buildTemplateGallery(all.slice(0, TEMPLATES_PER_PAGE), 0, all.length));
      return;
    }
    await this.nav(interaction, buildTemplateDetail(tpl));
  }

  private async navTplDeleteConfirm(interaction: NavInteraction, _guild: Guild, tplId: string): Promise<void> {
    const tpl = await templateEngine.get(tplId);
    if (!tpl || tpl.builtIn) {
      const all = await templateEngine.list();
      await this.nav(interaction, buildTemplateGallery(all.slice(0, TEMPLATES_PER_PAGE), 0, all.length));
      return;
    }
    await this.nav(interaction, buildTplDeleteConfirm(tpl));
  }

  private async handleTplDeleteConfirmed(interaction: NavInteraction, _guild: Guild, tplId: string): Promise<void> {
    const tpl = await templateEngine.get(tplId);
    if (!tpl || tpl.builtIn) {
      const all = await templateEngine.list();
      await this.nav(interaction, buildTemplateGallery(all.slice(0, TEMPLATES_PER_PAGE), 0, all.length));
      return;
    }
    const name = tpl.name;
    await templateEngine.delete(tplId);
    logger.info(`[TPD] Deleted custom template "${name}" (${tplId})`);
    const all = await templateEngine.list();
    await this.nav(interaction, buildTemplateGallery(all.slice(0, TEMPLATES_PER_PAGE), 0, all.length));
  }

  // ── Template create/save handlers ───────────────────────────────────────────

  private async handleCreateFromTemplate(interaction: ModalSubmitInteraction, guild: Guild, tplId: string): Promise<void> {
    const tpl = await templateEngine.get(tplId);
    if (!tpl) {
      await this.navReply(interaction, buildFeedback(false, 'Template not found.'));
      return;
    }

    const name      = getField(interaction, 'name',      true);
    const channelId = getField(interaction, 'channelId', false);

    const tplInput = templateEngine.toPanelInput(tpl);
    const panel = await panelManager.create(guild.id, {
      ...tplInput,
      name,
      channelId: channelId || '',
    });

    logger.info(`[TPD] Created panel "${panel.name}" (${panel.id}) from template "${tpl.name}" in guild ${guild.id}`);
    await this.navReply(interaction, buildPanelDashboard(panel));
  }

  private async handleSaveAsTemplate(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }

    const name        = getField(interaction, 'name',        true);
    const description = getField(interaction, 'description', false);

    // Extract the panel shape (strip runtime/identity fields)
    const { id: _id, guildId: _guildId, channelId: _channelId, messageId: _messageId,
            createdAt: _createdAt, updatedAt: _updatedAt, archivedAt: _archivedAt, ...panelShape } = panel;

    const template = await templateEngine.create(name, description || panel.description, panelShape);
    logger.info(`[TPD] Saved panel "${panel.name}" (${panel.id}) as template "${name}" (${template.id})`);
    await this.navReply(interaction, buildFeedback(
      true,
      `✅ Saved **${name}** to the Template Gallery!\nOther admins can now use this template from **📋 Templates**.`,
      panelId,
    ));
  }

  // ── Permission Designer handlers ─────────────────────────────────────────────

  private async handlePDMpermToggle(
    interaction: ButtonInteraction, guild: Guild, panelId: string, key: keyof TicketMemberPermConfig,
  ): Promise<void> {
    const raw = await panelManager.get(panelId);
    if (!raw || raw.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    const panel = normalizePanel(raw);
    const validKeys: (keyof TicketMemberPermConfig)[] = [
      'viewChannel', 'sendMessages', 'attachFiles', 'embedLinks', 'addReactions',
      'useExternalEmojis', 'useExternalStickers', 'mentionEveryone', 'createPublicThreads',
      'createPrivateThreads', 'sendVoiceMessages', 'readMessageHistory', 'useApplicationCommands',
    ];
    if (!validKeys.includes(key)) {
      await interaction.reply({ content: `❌ Unknown permission key: \`${key}\``, flags: MessageFlags.Ephemeral });
      return;
    }
    const updated = await panelManager.update(panelId, {
      memberPerms: { ...panel.memberPerms, [key]: !panel.memberPerms[key] },
    });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to save.')); return; }
    await this.nav(interaction, buildPDMemberPerms(updated));
  }

  private async handlePDSpermToggle(
    interaction: ButtonInteraction, guild: Guild, panelId: string, key: keyof TicketStaffPermConfig,
  ): Promise<void> {
    const raw = await panelManager.get(panelId);
    if (!raw || raw.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    const panel = normalizePanel(raw);
    const validKeys: (keyof TicketStaffPermConfig)[] = [
      'manageMessages', 'manageThreads', 'manageChannels', 'managePermissions',
      'mentionEveryone', 'manageWebhooks', 'manageEvents', 'priorityOverride',
    ];
    if (!validKeys.includes(key)) {
      await interaction.reply({ content: `❌ Unknown staff permission key: \`${key}\``, flags: MessageFlags.Ephemeral });
      return;
    }
    const updated = await panelManager.update(panelId, {
      staffPerms: { ...panel.staffPerms, [key]: !panel.staffPerms[key] },
    });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to save.')); return; }
    await this.nav(interaction, buildPDStaffPerms(updated));
  }

  private async handlePDSetVisibility(
    interaction: ButtonInteraction, guild: Guild, panelId: string, mode: TicketVisibilityMode,
  ): Promise<void> {
    const raw = await panelManager.get(panelId);
    if (!raw || raw.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    const validModes: TicketVisibilityMode[] = ['private', 'support_only', 'shared_support', 'public'];
    if (!validModes.includes(mode)) {
      await interaction.reply({ content: `❌ Unknown visibility mode: \`${mode}\``, flags: MessageFlags.Ephemeral });
      return;
    }
    const updated = await panelManager.update(panelId, { visibility: mode });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to save.')); return; }
    await this.nav(interaction, buildPDVisibility(updated));
  }

  private async handlePDClaimToggle(
    interaction: ButtonInteraction, guild: Guild, panelId: string, field: keyof TicketClaimBehaviourConfig,
  ): Promise<void> {
    const raw = await panelManager.get(panelId);
    if (!raw || raw.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    const panel = normalizePanel(raw);
    const validFields: (keyof TicketClaimBehaviourConfig)[] = [
      'hideFromOtherStaffOnClaim', 'keepVisible', 'managerOverride', 'adminOverride',
    ];
    if (!validFields.includes(field)) {
      await interaction.reply({ content: `❌ Unknown claim field: \`${field}\``, flags: MessageFlags.Ephemeral });
      return;
    }
    const updated = await panelManager.update(panelId, {
      claimBehaviour: { ...panel.claimBehaviour, [field]: !panel.claimBehaviour[field] },
    });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to save.')); return; }
    await this.nav(interaction, buildPDClaim(updated));
  }

  private async handlePDModalSubmit(
    interaction: ModalSubmitInteraction, guild: Guild, panelId: string, section: string,
  ): Promise<void> {
    const raw = await panelManager.get(panelId);
    if (!raw || raw.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }

    let patch: Partial<TicketPanel> = {};

    try {
      switch (section) {
        case 'support': {
          const supportRoles = parseIds(getField(interaction, 'supportRoles', false));
          patch = { supportRoles };
          break;
        }
        case 'manager': {
          const managerRoles = parseIds(getField(interaction, 'managerRoles', false));
          patch = { managerRoles };
          break;
        }
        case 'admin': {
          const adminRoles = parseIds(getField(interaction, 'adminRoles', false));
          patch = { adminRoles };
          break;
        }
        case 'ping': {
          const pingRoles = parseIds(getField(interaction, 'pingRoles', false));
          patch = { pingRoles };
          break;
        }
        case 'allowedroles': {
          const allowedRoles = parseIds(getField(interaction, 'allowedRoles', false));
          patch = { allowedRoles };
          break;
        }
        case 'blockedroles': {
          const blockedRoles = parseIds(getField(interaction, 'blockedRoles', false));
          patch = { blockedRoles };
          break;
        }
        case 'allowedusers': {
          const allowedUsers = parseIds(getField(interaction, 'allowedUsers', false));
          patch = { allowedUsers };
          break;
        }
        case 'blockedusers': {
          const blockedUsers = parseIds(getField(interaction, 'blockedUsers', false));
          patch = { blockedUsers };
          break;
        }
        case 'logchannel': {
          const logChannelId = getField(interaction, 'logChannelId', false);
          patch = { logChannelId: logChannelId || undefined };
          break;
        }
        default:
          await this.navReply(interaction, buildFeedback(false, `Unknown section: \`${section}\``));
          return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid input.';
      await this.navReply(interaction, buildFeedback(false, message, panelId));
      return;
    }

    const updated = await panelManager.update(panelId, patch);
    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to save changes.', panelId));
      return;
    }

    logger.info(`[TPD] PD updated panel ${panelId} section="${section}"`);
    await this.navReply(interaction, buildPDSupportTeam(updated));
  }

  // ── Form Builder helpers ─────────────────────────────────────────────────────

  /** Patches a single form inside a panel's `forms` array. Returns undefined if the panel/form doesn't exist or belongs to another guild. */
  private async updateForm(
    guildId: string, panelId: string, formId: string, patch: Partial<TicketForm>,
  ): Promise<{ panel: TicketPanel; form: TicketForm } | undefined> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guildId) return undefined;
    const idx = panel.forms.findIndex(f => f.id === formId);
    if (idx === -1) return undefined;
    const newForm: TicketForm = { ...panel.forms[idx], ...patch, updatedAt: Date.now() };
    const newForms = [...panel.forms];
    newForms[idx] = newForm;
    const updated = await panelManager.update(panelId, { forms: newForms });
    if (!updated) return undefined;
    const finalForm = updated.forms.find(f => f.id === formId) ?? newForm;
    return { panel: updated, form: finalForm };
  }

  /** Patches a single question inside a form. Returns undefined if the panel/form/question doesn't exist or belongs to another guild. */
  private async updateQuestion(
    guildId: string, panelId: string, formId: string, idx: number, patch: Partial<FormQuestion>,
  ): Promise<{ panel: TicketPanel; form: TicketForm } | undefined> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guildId) return undefined;
    const form = panel.forms.find(f => f.id === formId);
    if (!form || !form.questions[idx]) return undefined;
    const questions = [...form.questions];
    questions[idx] = { ...questions[idx], ...patch };
    return this.updateForm(guildId, panelId, formId, { questions });
  }

  /** Defensively parses/sanitizes a pasted form-export JSON blob into a fresh, collision-free TicketForm. Throws on invalid input. */
  private parseImportedForm(raw: string): TicketForm {
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error('That is not valid JSON.');
    }
    if (!obj || typeof obj !== 'object') throw new Error('The JSON must be an object.');
    const src = obj as Record<string, unknown>;
    if (!Array.isArray(src.questions)) throw new Error('Missing a "questions" array.');
    if (src.questions.length === 0) throw new Error('The form must have at least one question.');
    if (src.questions.length > MAX_QUESTIONS_PER_FORM) {
      throw new Error(`A form can have at most ${MAX_QUESTIONS_PER_FORM} questions (Discord limit). Trim the JSON and try again.`);
    }

    const questions: FormQuestion[] = src.questions.map((raw, i) => {
      if (!raw || typeof raw !== 'object') throw new Error(`Question ${i + 1} is invalid.`);
      const q = raw as Record<string, unknown>;
      const type: QuestionType = QUESTION_TYPES.includes(q.type as QuestionType) ? (q.type as QuestionType) : 'short_text';
      const title = typeof q.title === 'string' && q.title.trim() ? q.title.trim().slice(0, 45) : `Question ${i + 1}`;
      return {
        id: genId('q'),
        type,
        title,
        placeholder: typeof q.placeholder === 'string' ? q.placeholder.slice(0, 100) : undefined,
        description: typeof q.description === 'string' ? q.description.slice(0, 256) : undefined,
        required: q.required !== false,
        minLength: typeof q.minLength === 'number' ? q.minLength : undefined,
        maxLength: typeof q.maxLength === 'number' ? q.maxLength : undefined,
        defaultValue: typeof q.defaultValue === 'string' ? q.defaultValue.slice(0, 100) : undefined,
        validationRegex: typeof q.validationRegex === 'string' ? q.validationRegex : undefined,
        errorMessage: typeof q.errorMessage === 'string' ? q.errorMessage.slice(0, 256) : undefined,
        // showIf/chaining intentionally dropped on import — cross-form question IDs from the
        // source panel would not resolve to anything meaningful in the destination panel.
      };
    });

    const name = typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 45) : 'Imported Form';
    const description = typeof src.description === 'string' ? src.description.slice(0, 256) : undefined;
    const now = Date.now();
    return { id: genId('form'), name, description, questions, nextRules: [], defaultNextFormId: undefined, createdAt: now, updatedAt: now };
  }

  // ── Form Builder nav helpers ─────────────────────────────────────────────────

  private async navFrmNewGallery(interaction: NavInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    await this.nav(interaction, buildFormNewGallery(panel));
  }

  private async navFrmDetail(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    await this.nav(interaction, buildFormDetail(panel, form));
  }

  private async navFrmDeleteConfirm(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    await this.nav(interaction, buildFormDeleteConfirm(panel, form));
  }

  private async navFrmAssign(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    await this.nav(interaction, buildFormAssignView(panel, form));
  }

  private async navFrmChain(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    await this.nav(interaction, buildFormChainView(panel, form));
  }

  private async navFrmQAddTypePicker(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    if (form.questions.length >= MAX_QUESTIONS_PER_FORM) {
      await this.nav(interaction, buildFeedback(false, `Maximum ${MAX_QUESTIONS_PER_FORM} questions per form (Discord limit).`, panelId));
      return;
    }
    await this.nav(interaction, buildQAddTypePicker(panel, form));
  }

  private async navFrmQDetail(interaction: NavInteraction, guild: Guild, panelId: string, formId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form || !form.questions[idx]) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    await this.nav(interaction, buildQFrmDetail(panel, form, idx));
  }

  private async navFrmQCondView(interaction: NavInteraction, guild: Guild, panelId: string, formId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form || !form.questions[idx]) { await this.navSection(interaction, guild, panelId, 'forms'); return; }
    await this.nav(interaction, buildQCondView(panel, form, idx));
  }

  // ── Form Builder mutation handlers (buttons / select menus) ─────────────────

  private async handleFrmNewUse(interaction: NavInteraction, guild: Guild, panelId: string, tplKey: FormTemplateKey): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navPanelList(interaction, guild, 0); return; }
    const newForm = buildFormFromTemplate(tplKey);
    const updated = await panelManager.update(panelId, { forms: [...panel.forms, newForm] });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to create form.', panelId)); return; }
    logger.info(`[TPD] Created form "${newForm.name}" (${newForm.id}) on panel ${panelId} from template "${tplKey}"`);
    await this.nav(interaction, buildFormDetail(updated, newForm));
  }

  private async handleFrmDuplicate(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navPanelList(interaction, guild, 0); return; }

    const idMap = new Map<string, string>();
    const questions = form.questions.map(q => {
      const newId = genId('q');
      idMap.set(q.id, newId);
      return { ...q, id: newId };
    });
    const nextRules = form.nextRules.map(r => ({ ...r, questionId: idMap.get(r.questionId) ?? r.questionId }));
    const now = Date.now();
    const dup: TicketForm = {
      id: genId('form'),
      name: `${form.name} (copy)`,
      description: form.description,
      questions,
      nextRules,
      defaultNextFormId: form.defaultNextFormId,
      createdAt: now,
      updatedAt: now,
    };

    const updated = await panelManager.update(panelId, { forms: [...panel.forms, dup] });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to duplicate form.', panelId)); return; }
    logger.info(`[TPD] Duplicated form "${form.name}" -> "${dup.name}" (${dup.id}) on panel ${panelId}`);
    await this.nav(interaction, buildFormDetail(updated, dup));
  }

  private async handleFrmDeleteConfirmed(interaction: NavInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navPanelList(interaction, guild, 0); return; }

    const removedQIds = new Set(form.questions.map(q => q.id));
    const remainingForms: TicketForm[] = panel.forms
      .filter(f => f.id !== formId)
      .map(f => ({
        ...f,
        questions: f.questions.map(q => (q.showIf && removedQIds.has(q.showIf.questionId) ? { ...q, showIf: undefined } : q)),
        nextRules: f.nextRules.filter(r => r.nextFormId !== formId),
        defaultNextFormId: f.defaultNextFormId === formId ? undefined : f.defaultNextFormId,
      }));

    const patch: Partial<TicketPanel> = {
      forms: remainingForms,
      button: panel.button.formId === formId ? { ...panel.button, formId: undefined } : panel.button,
      additionalButtons: panel.additionalButtons.map(b => (b.formId === formId ? { ...b, formId: undefined } : b)),
      selectMenu: panel.selectMenu
        ? { ...panel.selectMenu, options: panel.selectMenu.options.map(o => (o.formId === formId ? { ...o, formId: undefined } : o)) }
        : undefined,
    };

    const updated = await panelManager.update(panelId, patch);
    logger.info(`[TPD] Deleted form "${form.name}" (${formId}) from panel ${panelId}`);
    await this.nav(interaction, buildFormBuilderMain(updated ?? panel));
  }

  private async handleFrmPreview(interaction: ButtonInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form || form.questions.length === 0) {
      await interaction.reply({ content: '❌ Form not found or has no questions to preview.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(questionEngine.buildFormModal(TP.FRM.prevModal(panelId, formId), form, {}));
  }

  private async handleFrmExport(interaction: ButtonInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) {
      await interaction.reply({ content: '❌ Form not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const json = JSON.stringify(form, null, 2);
    const safeName = form.name.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'form';
    const attachment = new AttachmentBuilder(Buffer.from(json, 'utf-8'), { name: `${safeName}.json` });
    await interaction.reply({ content: `📤 Exported **${form.name.slice(0, 100)}**.`, files: [attachment], flags: MessageFlags.Ephemeral });
  }

  private async handleFrmAssignSelect(
    interaction: StringSelectMenuInteraction, guild: Guild, panelId: string, formId: string, value: string,
  ): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navPanelList(interaction, guild, 0); return; }

    let patch: Partial<TicketPanel> | undefined;
    if (value === 'primary') {
      patch = { button: { ...panel.button, formId } };
    } else if (value.startsWith('extra:')) {
      const idx = parseInt(value.slice('extra:'.length), 10);
      if (!panel.additionalButtons[idx]) { await this.nav(interaction, buildFormAssignView(panel, form)); return; }
      const buttons = [...panel.additionalButtons];
      buttons[idx] = { ...buttons[idx], formId };
      patch = { additionalButtons: buttons };
    } else if (value.startsWith('opt:') && panel.selectMenu) {
      const idx = parseInt(value.slice('opt:'.length), 10);
      if (!panel.selectMenu.options[idx]) { await this.nav(interaction, buildFormAssignView(panel, form)); return; }
      const options = [...panel.selectMenu.options];
      options[idx] = { ...options[idx], formId };
      patch = { selectMenu: { ...panel.selectMenu, options } };
    }

    if (!patch) { await this.nav(interaction, buildFormAssignView(panel, form)); return; }
    const updated = await panelManager.update(panelId, patch);
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to save assignment.', panelId)); return; }
    const updatedForm = updated.forms.find(f => f.id === formId) ?? form;
    logger.info(`[TPD] Assigned form "${form.name}" (${formId}) to "${value}" on panel ${panelId}`);
    await this.nav(interaction, buildFormAssignView(updated, updatedForm));
  }

  private async handleFrmQToggleRequired(interaction: NavInteraction, guild: Guild, panelId: string, formId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form || !form.questions[idx]) { await this.navPanelList(interaction, guild, 0); return; }
    const result = await this.updateQuestion(guild.id, panelId, formId, idx, { required: !form.questions[idx].required });
    if (!result) { await this.nav(interaction, buildFeedback(false, 'Question not found.', panelId)); return; }
    await this.nav(interaction, buildQFrmDetail(result.panel, result.form, idx));
  }

  private async handleFrmQMove(
    interaction: NavInteraction, guild: Guild, panelId: string, formId: string, idx: number, dir: -1 | 1,
  ): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form || !form.questions[idx]) { await this.navPanelList(interaction, guild, 0); return; }
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= form.questions.length) { await this.nav(interaction, buildQFrmDetail(panel, form, idx)); return; }
    const questions = [...form.questions];
    [questions[idx], questions[newIdx]] = [questions[newIdx], questions[idx]];
    const result = await this.updateForm(guild.id, panelId, formId, { questions });
    if (!result) { await this.nav(interaction, buildFeedback(false, 'Failed to reorder question.', panelId)); return; }
    await this.nav(interaction, buildQFrmDetail(result.panel, result.form, newIdx));
  }

  private async handleFrmQRemove(interaction: NavInteraction, guild: Guild, panelId: string, formId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form || !form.questions[idx]) { await this.navPanelList(interaction, guild, 0); return; }

    const removedId = form.questions[idx].id;
    const forms: TicketForm[] = panel.forms.map(f => {
      const questions = (f.id === formId ? f.questions.filter((_, i) => i !== idx) : f.questions)
        .map(q => (q.showIf?.questionId === removedId ? { ...q, showIf: undefined } : q));
      const nextRules = f.id === formId ? f.nextRules.filter(r => r.questionId !== removedId) : f.nextRules;
      return { ...f, questions, nextRules };
    });

    const updated = await panelManager.update(panelId, { forms });
    if (!updated) { await this.nav(interaction, buildFeedback(false, 'Failed to remove question.', panelId)); return; }
    const updatedForm = updated.forms.find(f => f.id === formId)!;
    logger.info(`[TPD] Removed question ${idx} from form "${form.name}" (${formId})`);
    await this.nav(interaction, buildFormDetail(updated, updatedForm));
  }

  private async handleFrmQCondClear(interaction: NavInteraction, guild: Guild, panelId: string, formId: string, idx: number): Promise<void> {
    const result = await this.updateQuestion(guild.id, panelId, formId, idx, { showIf: undefined });
    if (!result) { await this.nav(interaction, buildFeedback(false, 'Question not found.', panelId)); return; }
    await this.nav(interaction, buildQCondView(result.panel, result.form, idx));
  }

  // ── Form Builder modal-submit handlers ───────────────────────────────────────

  private async handleFrmRenameSubmit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navReply(interaction, buildFeedback(false, 'Form not found.')); return; }

    const name = getField(interaction, 'name', true);
    const description = getField(interaction, 'description', false);

    const result = await this.updateForm(guild.id, panelId, formId, { name, description: description || undefined });
    if (!result) { await this.navReply(interaction, buildFeedback(false, 'Failed to rename form.', panelId)); return; }
    await this.navReply(interaction, buildFormDetail(result.panel, result.form));
  }

  private async handleFrmChainSubmit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navReply(interaction, buildFeedback(false, 'Form not found.')); return; }

    const defaultNextRaw = getField(interaction, 'defaultNextFormId', false);
    const nextRulesRaw   = getField(interaction, 'nextRulesJson', false);

    try {
      let defaultNextFormId: string | undefined;
      if (defaultNextRaw) {
        if (defaultNextRaw === formId) throw new Error('A form cannot chain to itself.');
        if (!panel.forms.some(f => f.id === defaultNextRaw)) throw new Error(`Unknown form ID: "${defaultNextRaw}".`);
        defaultNextFormId = defaultNextRaw;
      }

      let nextRules: FormNextRule[] = [];
      if (nextRulesRaw) {
        let parsed: unknown;
        try { parsed = JSON.parse(nextRulesRaw); } catch { throw new Error('Conditional rules must be valid JSON.'); }
        if (!Array.isArray(parsed)) throw new Error('Conditional rules JSON must be an array.');
        nextRules = parsed.map((raw, i) => {
          const r = raw as Record<string, unknown>;
          if (typeof r?.questionId !== 'string' || typeof r?.equals !== 'string' || typeof r?.nextFormId !== 'string') {
            throw new Error(`Rule ${i + 1} must have "questionId", "equals", and "nextFormId" strings.`);
          }
          if (!form.questions.some(q => q.id === r.questionId)) {
            throw new Error(`Rule ${i + 1}: unknown question ID "${r.questionId}" (must be one of this form's own questions).`);
          }
          if (r.nextFormId === formId) throw new Error(`Rule ${i + 1}: a form cannot chain to itself.`);
          if (!panel.forms.some(f => f.id === r.nextFormId)) throw new Error(`Rule ${i + 1}: unknown next form ID "${r.nextFormId}".`);
          return { questionId: r.questionId, equals: r.equals, nextFormId: r.nextFormId } as FormNextRule;
        });
      }

      const result = await this.updateForm(guild.id, panelId, formId, { defaultNextFormId, nextRules });
      if (!result) { await this.navReply(interaction, buildFeedback(false, 'Failed to save chaining.', panelId)); return; }
      await this.navReply(interaction, buildFormChainView(result.panel, result.form));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid input.';
      await this.navReply(interaction, buildFeedback(false, message, panelId));
    }
  }

  private async handleFrmImportSubmit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) { await this.navReply(interaction, buildFeedback(false, 'Panel not found.')); return; }

    const raw = getField(interaction, 'json', true);
    try {
      const form = this.parseImportedForm(raw);
      const updated = await panelManager.update(panelId, { forms: [...panel.forms, form] });
      if (!updated) throw new Error('Failed to save imported form.');
      logger.info(`[TPD] Imported form "${form.name}" (${form.id}) into panel ${panelId}`);
      await this.navReply(interaction, buildFormDetail(updated, form));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid form JSON.';
      await this.navReply(interaction, buildFeedback(false, message, panelId));
    }
  }

  private async handleFrmQAddSubmit(
    interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string, type: string,
  ): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navReply(interaction, buildFeedback(false, 'Form not found.')); return; }
    if (form.questions.length >= MAX_QUESTIONS_PER_FORM) {
      await this.navReply(interaction, buildFeedback(false, `Maximum ${MAX_QUESTIONS_PER_FORM} questions per form (Discord limit).`, panelId));
      return;
    }

    const title        = getField(interaction, 'title', true);
    const placeholder  = getField(interaction, 'placeholder', false);
    const defaultValue = getField(interaction, 'defaultValue', false);
    const description  = getField(interaction, 'description', false);
    const qType: QuestionType = QUESTION_TYPES.includes(type as QuestionType) ? (type as QuestionType) : 'short_text';

    const newQuestion: FormQuestion = {
      id: genId('q'),
      type: qType,
      title,
      placeholder: placeholder || undefined,
      description: description || undefined,
      defaultValue: defaultValue || undefined,
      required: true,
    };

    const newIdx = form.questions.length;
    const result = await this.updateForm(guild.id, panelId, formId, { questions: [...form.questions, newQuestion] });
    if (!result) { await this.navReply(interaction, buildFeedback(false, 'Failed to add question.', panelId)); return; }
    await this.navReply(interaction, buildQFrmDetail(result.panel, result.form, newIdx));
  }

  private async handleFrmQBasicSubmit(
    interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string, idx: number,
  ): Promise<void> {
    const title        = getField(interaction, 'title', true);
    const placeholder  = getField(interaction, 'placeholder', false);
    const defaultValue = getField(interaction, 'defaultValue', false);
    const description  = getField(interaction, 'description', false);

    const result = await this.updateQuestion(guild.id, panelId, formId, idx, {
      title, placeholder: placeholder || undefined, defaultValue: defaultValue || undefined, description: description || undefined,
    });
    if (!result) { await this.navReply(interaction, buildFeedback(false, 'Question not found.', panelId)); return; }
    await this.navReply(interaction, buildQFrmDetail(result.panel, result.form, idx));
  }

  private async handleFrmQLenSubmit(
    interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string, idx: number,
  ): Promise<void> {
    const minRaw = getField(interaction, 'minLength', true);
    const maxRaw = getField(interaction, 'maxLength', true);
    const min = parseIntSafe(minRaw, 0, 4000, 0);
    const max = parseIntSafe(maxRaw, 1, 4000, 1000);
    if (min > max) {
      await this.navReply(interaction, buildFeedback(false, 'Minimum length cannot exceed maximum length.', panelId));
      return;
    }
    const result = await this.updateQuestion(guild.id, panelId, formId, idx, { minLength: min, maxLength: max });
    if (!result) { await this.navReply(interaction, buildFeedback(false, 'Question not found.', panelId)); return; }
    await this.navReply(interaction, buildQFrmDetail(result.panel, result.form, idx));
  }

  private async handleFrmQValSubmit(
    interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string, idx: number,
  ): Promise<void> {
    const regex = getField(interaction, 'validationRegex', false);
    const errorMessage = getField(interaction, 'errorMessage', false);
    if (regex) {
      try { new RegExp(regex); } catch {
        await this.navReply(interaction, buildFeedback(false, `Invalid regular expression: "${regex}"`, panelId));
        return;
      }
    }
    const result = await this.updateQuestion(guild.id, panelId, formId, idx, {
      validationRegex: regex || undefined, errorMessage: errorMessage || undefined,
    });
    if (!result) { await this.navReply(interaction, buildFeedback(false, 'Question not found.', panelId)); return; }
    await this.navReply(interaction, buildQFrmDetail(result.panel, result.form, idx));
  }

  private async handleFrmQCondSubmit(
    interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string, idx: number, srcQId: string,
  ): Promise<void> {
    const equals = getField(interaction, 'equals', true);
    const result = await this.updateQuestion(guild.id, panelId, formId, idx, { showIf: { questionId: srcQId, equals } });
    if (!result) { await this.navReply(interaction, buildFeedback(false, 'Question not found.', panelId)); return; }
    await this.navReply(interaction, buildQCondView(result.panel, result.form, idx));
  }

  private async handleFrmPreviewSubmit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, formId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    const form = panel?.forms?.find(f => f.id === formId);
    if (!panel || panel.guildId !== guild.id || !form) { await this.navReply(interaction, buildFeedback(false, 'Form not found.')); return; }

    const result = questionEngine.validateForm(interaction, form, {});
    if (!result.ok) {
      const lines = result.errors.map(e => `❌ **${e.title}**: ${e.message}`).join('\n');
      await this.navReply(interaction, buildFeedback(false, `Preview validation failed:\n${lines}`, panelId));
      return;
    }

    const fields = questionEngine.formatFormAnswersForEmbed([form], result.answers);
    const lines = fields.length > 0 ? fields.map(f => `**${f.name}:** ${f.value}`).join('\n') : '_No answers provided._';
    await this.navReply(interaction, buildFeedback(true, `👁 Preview only — nothing was saved.\n\n${lines}`, panelId));
  }

  // ── Error helpers ───────────────────────────────────────────────────────────

  private errorPayload(message: string): CCPayload {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ Panel Designer Error')
      .setDescription(truncate(message, 2000));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('← Panels').setCustomId(TP.LIST).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('🏠 Home').setCustomId(CC.HOME).setStyle(ButtonStyle.Secondary),
    );
    return { content: '', embeds: [embed], components: [row] };
  }

  private async safeError(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    const payload = this.errorPayload(message);
    try {
      if ((interaction as { deferred?: boolean; replied?: boolean }).deferred || (interaction as { replied?: boolean }).replied) {
        await (interaction as ModalSubmitInteraction).editReply(payload).catch(() => {});
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    } catch (deliveryErr) {
      if (isStale(deliveryErr)) return;
      logger.error('[TPD] Failed to deliver error', deliveryErr);
    }
  }

  private isAdmin(interaction: Interaction): boolean {
    if (!interaction.guild) return false;
    const member = interaction.member;
    if (!member) return false;
    try {
      return this.permissionManager.isAdmin(member as GuildMember);
    } catch {
      return false;
    }
  }
}
