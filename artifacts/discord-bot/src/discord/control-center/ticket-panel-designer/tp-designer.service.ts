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
import type { TicketPanel, TicketButtonConfig, TicketSelectMenuOption, TicketModalQuestion, TicketPriority, TicketMemberPermConfig, TicketStaffPermConfig, TicketClaimBehaviourConfig, TicketVisibilityMode, TicketForm, FormQuestion, FormNextRule, QuestionType } from '../../../community/tickets/types';
import { normalizePanel, DEFAULT_MEMBER_PERMS, DEFAULT_STAFF_PERMS, DEFAULT_CLAIM_BEHAVIOUR, QUESTION_TYPES } from '../../../community/tickets/types';
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
  buildQuestionsSection,
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
  buildQuestionDetail,
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
  buildPrimaryButtonModal,
  buildExtraButtonModal,
  buildSmOptionModal,
  buildSmPlaceholderModal,
  buildQuestionModal,
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
    // Question section
    if (id.startsWith('tp:q:add:')) {
      const panelId = id.slice('tp:q:add:'.length);
      await interaction.showModal(buildQuestionModal(panelId, null, TP.qAddM(panelId)));
      return;
    }
    if (id.startsWith('tp:q:detail:')) {
      const parts = id.split(':');
      await this.navQDetail(interaction, guild, parts[3], parseInt(parts[4], 10));
      return;
    }
    if (id.startsWith('tp:q:edit:')) {
      const parts = id.split(':');
      const panelId = parts[3];
      const idx     = parseInt(parts[4], 10);
      const panel = await panelManager.get(panelId);
      const existing = panel?.modal.questions[idx] ?? null;
      await interaction.showModal(buildQuestionModal(panelId, existing, TP.qEditM(panelId, idx)));
      return;
    }
    if (id.startsWith('tp:q:rm:')) {
      const parts = id.split(':');
      await this.handleQRemove(interaction, guild, parts[3], parseInt(parts[4], 10));
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
    if (id.startsWith('tp:qs:')) {
      // Question select — value is idx
      const panelId = id.slice('tp:qs:'.length);
      await this.navQDetail(interaction, guild, panelId, parseInt(value, 10));
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
    if (id.startsWith('tp:q:add:m:')) {
      await this.handleQAdd(interaction, guild, id.slice('tp:q:add:m:'.length));
      return;
    }
    if (id.startsWith('tp:q:edit:m:')) {
      const rest  = id.slice('tp:q:edit:m:'.length);
      const colon = rest.lastIndexOf(':');
      const panelId = rest.slice(0, colon);
      const idx     = parseInt(rest.slice(colon + 1), 10);
      await this.handleQEdit(interaction, guild, panelId, idx);
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

  private async navQDetail(interaction: NavInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.modal.questions[idx]) {
      await this.navSection(interaction, guild, panelId, 'questions');
      return;
    }
    await this.nav(interaction, buildQuestionDetail(panel, idx));
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

    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    const style = validStyles.find(s => s.toLowerCase() === styleRaw.toLowerCase()) ?? 'Primary';

    const updated = await panelManager.update(panelId, {
      button: { label, style: style as TicketButtonConfig['style'], emoji: emoji || undefined, ticketType },
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

    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    const style = validStyles.find(s => s.toLowerCase() === styleRaw.toLowerCase()) ?? 'Primary';

    const newBtn: TicketButtonConfig = { label, style: style as TicketButtonConfig['style'], emoji: emoji || undefined, ticketType };
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

    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    const style = validStyles.find(s => s.toLowerCase() === styleRaw.toLowerCase()) ?? 'Primary';

    const newButtons = [...panel.additionalButtons];
    newButtons[idx] = { label, style: style as TicketButtonConfig['style'], emoji: emoji || undefined, ticketType };
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

    const newOpt: TicketSelectMenuOption = { label, value: ticketType, ticketType, description: description || undefined, emoji: emoji || undefined };
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

    const newOpts = [...panel.selectMenu.options];
    newOpts[idx] = { label, value: ticketType, ticketType, description: description || undefined, emoji: emoji || undefined };
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

  // ── Question handlers ───────────────────────────────────────────────────────

  private async handleQAdd(interaction: ModalSubmitInteraction, guild: Guild, panelId: string): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navReply(interaction, buildFeedback(false, 'Panel not found.'));
      return;
    }
    if (panel.modal.questions.length >= 5) {
      await this.navReply(interaction, buildFeedback(false, 'Maximum 5 questions per modal (Discord limit).', panelId));
      return;
    }

    const id          = getField(interaction, 'id',          true);
    const label       = getField(interaction, 'label',       true);
    const styleRaw    = getField(interaction, 'style',       true);
    const placeholder = getField(interaction, 'placeholder', false);
    const required    = parseBool(getField(interaction, 'required', true));

    const style: TicketModalQuestion['style'] = styleRaw.toLowerCase() === 'paragraph' ? 'paragraph' : 'short';

    if (panel.modal.questions.some(q => q.id === id)) {
      await this.navReply(interaction, buildFeedback(false, `Question ID "${id}" already exists. Use a unique ID.`, panelId));
      return;
    }

    const newQ: TicketModalQuestion = { id, label, style, placeholder: placeholder || undefined, required };
    const updated = await panelManager.update(panelId, { modal: { ...panel.modal, questions: [...panel.modal.questions, newQ] } });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to add question.', panelId));
      return;
    }
    await this.navReply(interaction, buildQuestionsSection(updated));
  }

  private async handleQEdit(interaction: ModalSubmitInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id || !panel.modal.questions[idx]) {
      await this.navReply(interaction, buildFeedback(false, 'Question not found.', panelId));
      return;
    }

    const id          = getField(interaction, 'id',          true);
    const label       = getField(interaction, 'label',       true);
    const styleRaw    = getField(interaction, 'style',       true);
    const placeholder = getField(interaction, 'placeholder', false);
    const required    = parseBool(getField(interaction, 'required', true));

    const style: TicketModalQuestion['style'] = styleRaw.toLowerCase() === 'paragraph' ? 'paragraph' : 'short';

    const newQs = [...panel.modal.questions];
    newQs[idx] = { id, label, style, placeholder: placeholder || undefined, required };
    const updated = await panelManager.update(panelId, { modal: { ...panel.modal, questions: newQs } });

    if (!updated) {
      await this.navReply(interaction, buildFeedback(false, 'Failed to update question.', panelId));
      return;
    }
    await this.navReply(interaction, buildQuestionsSection(updated));
  }

  private async handleQRemove(interaction: NavInteraction, guild: Guild, panelId: string, idx: number): Promise<void> {
    const panel = await panelManager.get(panelId);
    if (!panel || panel.guildId !== guild.id) {
      await this.navSection(interaction, guild, panelId, 'questions');
      return;
    }
    const newQs = panel.modal.questions.filter((_, i) => i !== idx);
    const updated = await panelManager.update(panelId, { modal: { ...panel.modal, questions: newQs } });
    await this.nav(interaction, buildQuestionsSection(updated ?? panel));
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
