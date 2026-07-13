import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import type {
  Guild,
  GuildMember,
  ButtonInteraction,
  StringSelectMenuInteraction,
  RoleSelectMenuInteraction,
  ModalSubmitInteraction,
  ChatInputCommandInteraction,
  Interaction,
  RepliableInteraction,
} from 'discord.js';
import type { ToolRegistry } from '../../ai/tool-registry';
import type { PermissionManager } from '../../ai/permission-manager';
import { truncate } from './cc-categories';
import type { CategoryKey } from './cc-categories';
import { CC } from './cc-ids';
import { ControlCenterCache } from './cc-cache';
import {
  buildDashboard,
  buildCategoryPanel,
  buildToolDetail,
  buildResult,
  buildConfirm,
  buildSearchResults,
  buildFavoritesPanel,
  buildToolModal,
  buildSearchModal,
  buildTranslateModal,
} from './cc-renderer';
import { assertUniqueCustomIds } from './cc-debug';
import { getFavorites, toggleFavorite, isFavorite } from './cc-favorites';
import { getWelcomeConfig, setWelcomeConfig } from '../welcome/welcome-store';
import { getGeminiClient, AI_MODEL } from '../../ai/gemini-client';
import { logger } from '../../utils/logger';

type NavInteraction = ButtonInteraction | StringSelectMenuInteraction;

// Discord error codes we handle explicitly
const UNKNOWN_INTERACTION  = 10062; // Interaction token expired / new gateway session
const ALREADY_ACKNOWLEDGED = 40060; // Already deferred or replied

/** True when a Discord API error is an unrecoverable stale-interaction error. */
function isStaleInteraction(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return code === UNKNOWN_INTERACTION || code === ALREADY_ACKNOWLEDGED;
  }
  return false;
}

export class ControlCenterService {
  private readonly pendingExec = new Map<string, { toolName: string; params: Record<string, unknown>; category: CategoryKey }>();

  /** Built once at construction time (bot startup) — never rebuilt per /panel. */
  private readonly cache: ControlCenterCache;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly permissionManager: PermissionManager,
  ) {
    this.cache = new ControlCenterCache(toolRegistry);
  }

  // ── Entry Points ───────────────────────────────────────────────────────────

  async handlePanelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const t0 = Date.now();
    const timings: Record<string, number> = {};

    try {
      let t = Date.now();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      timings.deferReply = Date.now() - t;

      if (!interaction.guild) {
        await interaction.editReply(this.errorPayload('❌ Control Center only works inside a server.'));
        return;
      }
      if (!this.isAdmin(interaction)) {
        await interaction.editReply(this.errorPayload('❌ You do not have permission to use the Control Center.'));
        return;
      }

      t = Date.now();
      const toolCount = this.cache.toolCount;
      timings.registryLoad = Date.now() - t;

      t = Date.now();
      const counts = this.cache.categoryCounts;
      timings.categoryGen = Date.now() - t;

      t = Date.now();
      const payload = this.buildDashboardPayload();
      timings.uiGen = Date.now() - t;

      t = Date.now();
      assertUniqueCustomIds('/panel dashboard', payload);
      await interaction.editReply(payload);
      timings.editReply = Date.now() - t;

      const total = Date.now() - t0;
      logger.info(
        `[CC][timing] /panel total=${total}ms defer=${timings.deferReply}ms registry=${timings.registryLoad}ms ` +
        `categoryGen=${timings.categoryGen}ms uiGen=${timings.uiGen}ms editReply=${timings.editReply}ms tools=${toolCount}`,
      );
    } catch (err) {
      if (isStaleInteraction(err)) {
        // Interaction token expired (e.g. bot restarted while /panel was in-flight). Silently drop.
        logger.info('[CC] /panel: stale interaction dropped (10062/40060)');
        return;
      }
      logger.error('[CC] /panel failed', err);
      await this.safeErrorReply(interaction, err);
    }
  }

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.isAdmin(interaction)) return;

    try {
      if (interaction.isButton()) {
        await this.routeButton(interaction, guild);
      } else if (interaction.isStringSelectMenu()) {
        await this.routeSelectMenu(interaction, guild);
      } else if (interaction.isRoleSelectMenu()) {
        await this.routeRoleSelectMenu(interaction, guild);
      } else if (interaction.isModalSubmit()) {
        await this.routeModal(interaction, guild);
      }
    } catch (err) {
      if (isStaleInteraction(err)) {
        // User clicked a button on an ephemeral panel from before the bot restarted.
        // The interaction token is irrecoverable — silently drop.
        logger.info(`[CC] Stale interaction dropped (10062/40060): ${interaction.isButton() ? interaction.customId : 'select/modal'}`);
        return;
      }
      logger.error('[CC] Interaction routing failed', err);
      await this.safeErrorReply(interaction, err);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === CC.HOME || id === CC.CANCEL) {
      await this.nav(interaction, this.buildDashboardPayload(), 'home');
      return;
    }
    if (id === CC.FAVS) {
      await this.navToFavorites(interaction);
      return;
    }
    if (id === CC.SRCH) {
      await interaction.showModal(buildSearchModal());
      return;
    }
    if (id === CC.TRANSLATE) {
      await interaction.showModal(buildTranslateModal());
      return;
    }

    const parts = id.split(':');
    const action = parts[1];

    if (action === 'pg') {
      await this.navToCategory(interaction, parts[2] as CategoryKey, parseInt(parts[3], 10));
      return;
    }
    if (action === 'cat') {
      await this.navToCategory(interaction, parts[2] as CategoryKey, 0);
      return;
    }
    if (action === 'tool') {
      await this.navToTool(interaction, guild, parts.slice(2).join(':'));
      return;
    }
    if (action === 'exec') {
      await this.handleExecute(interaction, guild, parts.slice(2).join(':'));
      return;
    }
    if (action === 'do') {
      await this.handleConfirmedExec(interaction, guild, parts.slice(2).join(':'));
      return;
    }
    if (action === 'fav') {
      await this.handleFavToggle(interaction, guild, parts.slice(2).join(':'));
      return;
    }
    if (action === 'welcome' && parts[2] === 'autorole') {
      await this.showAutoRolePicker(interaction, guild);
      return;
    }
  }

  private async routeSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    const value = interaction.values[0];

    // Both cc:cs (part 1) and cc:cs2 (part 2) navigate to the selected category
    if (id === CC.CAT_SELECT || id === CC.CAT_SELECT2) {
      await this.navToCategory(interaction, value as CategoryKey, 0);
      return;
    }

    // Tool selects: cc:ts:<cat>:<page>, cc:ts:search:0, cc:ts:favs:0
    if (id.startsWith('cc:ts:')) {
      await this.navToTool(interaction, guild, value);
      return;
    }
  }

  private async routeRoleSelectMenu(interaction: RoleSelectMenuInteraction, guild: Guild): Promise<void> {
    if (interaction.customId === CC.WELCOME_AUTOROLE_SELECT) {
      await this.handleAutoRoleSelected(interaction, guild);
    }
  }

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === CC.SEARCH_SUBMIT) {
      await this.handleSearch(interaction);
      return;
    }
    if (id.startsWith('cc:modal:')) {
      const toolName = id.slice('cc:modal:'.length);
      await this.handleModalExec(interaction, guild, toolName);
      return;
    }
    if (id === CC.TRANSLATE_SUBMIT) {
      await this.handleTranslate(interaction);
      return;
    }
  }

  // ── Translate (English → Arabic, available on every tab) ───────────────────

  private async handleTranslate(interaction: ModalSubmitInteraction): Promise<void> {
    const text = interaction.fields.getTextInputValue('text').trim();

    // Reply as a brand-new ephemeral message — never edits/overwrites the panel underneath.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!text) {
      await interaction.editReply({ content: '❌ Please enter some text to translate.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      await interaction.editReply({ content: '❌ Translation is unavailable — GEMINI_API_KEY is not set.' });
      return;
    }

    try {
      const res = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{
          role: 'user',
          parts: [{ text: `Translate the following English text to Arabic. Respond with ONLY the Arabic translation — no notes, no transliteration, no extra commentary.\n\nText:\n${text}` }],
        }],
      });
      const translation = res.text?.trim() || '_Could not translate._';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🌐 Translation (English → Arabic)')
        .addFields(
          { name: '🇬🇧 English', value: truncate(text, 1024), inline: false },
          { name: '🇸🇦 Arabic',  value: truncate(translation, 1024), inline: false },
        );

      await interaction.editReply({ embeds: [embed] });
      logger.info(`[CC] Translated text to Arabic for ${interaction.user.tag}`);
    } catch (err) {
      logger.error('[CC] Translate error', err);
      await interaction.editReply({ content: `❌ Translation failed: ${err instanceof Error ? err.message : err}` });
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  private buildDashboardPayload() {
    const payload = buildDashboard(this.cache.toolCount, this.cache.categoryCounts);
    // Inject Support Inbox Pro shortcut onto the main dashboard
    payload.components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('si:home')
          .setLabel('📥 Support Inbox')
          .setStyle(ButtonStyle.Primary),
      ),
    );
    return payload;
  }

  private async navToCategory(interaction: NavInteraction, category: CategoryKey, page: number): Promise<void> {
    const tUi = Date.now();
    const tools = this.cache.getToolsByCategory(category);
    const safePage = Math.max(0, Math.min(page, Math.floor((tools.length - 1) / 20)));
    const payload = buildCategoryPanel(category, tools, safePage);

    if (category === 'tickets') {
      payload.components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('🎨 Ticket Panel Designer')
            .setCustomId('tp:list')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setLabel('📈 Ticket SLA')
            .setCustomId('sla:home')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setLabel('⭐ Review Analytics')
            .setCustomId('ra:home')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setLabel('📊 Staff Progress')
            .setCustomId('sp:home')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }
    if (category === 'welcome') {
      payload.components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('🎭 Set Auto-Role')
            .setCustomId(CC.WELCOME_AUTOROLE)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setLabel('🖼️ Welcome Card Designer')
            .setCustomId('wc:home')
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }
    if (category === 'serverlogs') {
      payload.components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('📋 Logs Manager')
            .setCustomId('lg:dash')
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }
    if (category === 'moderation') {
      payload.components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('🔨 Mod System Pro')
            .setCustomId('md:dash')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setLabel('👮 Staff Management Pro')
            .setCustomId('sm:dash')
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }
    if (category === 'security') {
      payload.components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('🛡️ Security Center')
            .setCustomId('sc:home')
            .setStyle(ButtonStyle.Danger),
        ),
      );
    }
    if (category === 'members') {
      payload.components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('📥 Support Inbox')
            .setCustomId('si:home')
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }

    const uiGenMs = Date.now() - tUi;
    await this.nav(interaction, payload, `category:${category}`, { uiGen: uiGenMs });
  }

  private async navToTool(interaction: NavInteraction, _guild: Guild, toolName: string): Promise<void> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      await this.nav(interaction, this.buildDashboardPayload(), 'home');
      return;
    }
    const category = this.cache.getCategory(toolName);

    const tFav = Date.now();
    const fav = await isFavorite(interaction.user.id, toolName);
    const favMs = Date.now() - tFav;

    const tUi = Date.now();
    const payload = buildToolDetail(tool, category, fav);
    const uiGenMs = Date.now() - tUi;

    await this.nav(interaction, payload, `tool:${toolName}`, { favorites: favMs, uiGen: uiGenMs });
  }

  private async navToFavorites(interaction: NavInteraction): Promise<void> {
    const tFav = Date.now();
    const favNames = await getFavorites(interaction.user.id);
    const tools = favNames.map(n => this.toolRegistry.getTool(n)).filter(Boolean) as NonNullable<ReturnType<ToolRegistry['getTool']>>[];
    const favMs = Date.now() - tFav;

    await this.nav(interaction, buildFavoritesPanel(tools), 'favorites', { favorites: favMs });
  }

  // ── Welcome / Auto-Role ────────────────────────────────────────────────────

  private async showAutoRolePicker(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getWelcomeConfig(guild.id);

    const select = new RoleSelectMenuBuilder()
      .setCustomId(CC.WELCOME_AUTOROLE_SELECT)
      .setPlaceholder('Select role(s) to auto-assign on join')
      .setMinValues(0)
      .setMaxValues(10);

    const currentLabel = cfg.autoRoleIds.length
      ? cfg.autoRoleIds.map(id => `<@&${id}>`).join(', ')
      : '_none set_';

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🎭 Auto-Role on Join')
      .setDescription(
        `Pick the role(s) every **new member** should automatically receive the moment they join.\n\n` +
        `**Currently assigned:** ${currentLabel}\n\n` +
        `Select none and confirm to clear auto-roles.`,
      );

    const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select);
    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🏠 Home').setCustomId(CC.HOME).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('⬅️ Back').setCustomId(CC.cat('welcome')).setStyle(ButtonStyle.Secondary),
    );

    const payload = { content: '', embeds: [embed], components: [row, backRow] };
    assertUniqueCustomIds('showAutoRolePicker', payload);
    await interaction.deferUpdate();
    await interaction.editReply(payload);
  }

  private async handleAutoRoleSelected(interaction: RoleSelectMenuInteraction, guild: Guild): Promise<void> {
    await interaction.deferUpdate();
    const roleIds = interaction.roles.map(r => r.id);
    const cfg = await setWelcomeConfig(guild.id, { autoRoleIds: roleIds });

    const label = cfg.autoRoleIds.length ? cfg.autoRoleIds.map(id => `<@&${id}>`).join(', ') : '_none_';
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Auto-Role Updated')
      .setDescription(
        `New members will now automatically receive: ${label}\n\n` +
        `This applies the moment they join — independent of whether welcome messages are enabled.`,
      );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🎭 Change Again').setCustomId(CC.WELCOME_AUTOROLE).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setLabel('⬅️ Back').setCustomId(CC.cat('welcome')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('🏠 Home').setCustomId(CC.HOME).setStyle(ButtonStyle.Secondary),
    );

    const payload = { content: '', embeds: [embed], components: [row] };
    assertUniqueCustomIds('handleAutoRoleSelected', payload);
    await interaction.editReply(payload);
    logger.info(`[CC] Auto-role updated for guild ${guild.id}: [${cfg.autoRoleIds.join(', ')}]`);
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  private async handleExecute(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) { await this.nav(interaction, this.buildDashboardPayload(), 'home'); return; }

    const hasParams = Object.keys(tool.definition.parameters.properties ?? {}).length > 0;

    if (hasParams) {
      await interaction.showModal(buildToolModal(tool));
      return;
    }

    if (tool.definition.dangerous) {
      const key = `${interaction.user.id}:${toolName}`;
      this.pendingExec.set(key, { toolName, params: {}, category: this.cache.getCategory(toolName) });
      await this.nav(interaction, buildConfirm(tool, '_None_', this.cache.getCategory(toolName)), 'confirm');
    } else {
      await interaction.deferUpdate();
      await this.executeTool(interaction, guild, toolName, {});
    }
  }

  private async handleConfirmedExec(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const key = `${interaction.user.id}:${toolName}`;
    const pending = this.pendingExec.get(key);
    this.pendingExec.delete(key);

    const params = pending?.params ?? {};
    await interaction.deferUpdate();
    await this.executeTool(interaction, guild, toolName, params);
  }

  private async handleModalExec(interaction: ModalSubmitInteraction, guild: Guild, toolName: string): Promise<void> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      await interaction.reply({ content: '❌ Tool not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const params = this.parseModalParams(interaction, tool);

    if (tool.definition.dangerous) {
      const key = `${interaction.user.id}:${toolName}`;
      const paramSummary = Object.entries(params).map(([k, v]) => `**${k}:** ${String(v)}`).join('\n') || '_None_';
      this.pendingExec.set(key, { toolName, params, category: this.cache.getCategory(toolName) });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const confirmPayload = buildConfirm(tool, paramSummary, this.cache.getCategory(toolName));
      assertUniqueCustomIds(`handleModalExec:confirm(${toolName})`, confirmPayload);
      await interaction.editReply(confirmPayload);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.runTool(toolName, params, guild);
    const category = this.cache.getCategory(toolName);
    const resultPayload = buildResult(toolName, result, category);
    assertUniqueCustomIds(`handleModalExec:result(${toolName})`, resultPayload);
    await interaction.editReply(resultPayload);
  }

  private async executeTool(
    interaction: ButtonInteraction,
    guild: Guild,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.runTool(toolName, params, guild);
    const category = this.cache.getCategory(toolName);
    const payload = buildResult(toolName, result, category);
    assertUniqueCustomIds(`executeTool(${toolName})`, payload);
    await interaction.editReply(payload);
  }

  private async runTool(toolName: string, params: Record<string, unknown>, guild: Guild) {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) return { success: false, message: `Tool "${toolName}" not found.` };

    try {
      logger.info(`[CC] Executing ${toolName} with params: ${JSON.stringify(params)}`);
      const result = await tool.execute(params, guild);
      logger.info(`[CC] ${toolName}: ${result.success ? '✅' : '❌'} ${result.message}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error during execution';
      logger.error(`[CC] ${toolName} threw an error`, err);
      return { success: false, message };
    }
  }

  private parseModalParams(interaction: ModalSubmitInteraction, tool: ReturnType<ToolRegistry['getTool']>): Record<string, unknown> {
    const props = tool!.definition.parameters.properties ?? {};
    const params: Record<string, unknown> = {};

    for (const [key, schema] of Object.entries(props)) {
      try {
        const raw = interaction.fields.getTextInputValue(key);
        if (!raw && !tool!.definition.parameters.required?.includes(key)) continue;
        if (schema.type === 'number' || schema.type === 'integer') {
          const n = Number(raw);
          if (!isNaN(n)) params[key] = n;
        } else if (schema.type === 'boolean') {
          params[key] = raw.toLowerCase() === 'true' || raw === '1';
        } else {
          params[key] = raw;
        }
      } catch {
        // Field not present in modal (optional, omit)
      }
    }
    return params;
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  private async handleSearch(interaction: ModalSubmitInteraction): Promise<void> {
    const query = interaction.fields.getTextInputValue('query').trim();

    const tSearch = Date.now();
    const tools = this.cache.search(query);
    const searchMs = Date.now() - tSearch;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const payload = buildSearchResults(query, tools);
    assertUniqueCustomIds(`handleSearch("${query}")`, payload);
    await interaction.editReply(payload);

    logger.info(`[CC][timing] search query="${query}" searchIndex=${searchMs}ms results=${tools.length}`);
  }

  // ── Favorites ──────────────────────────────────────────────────────────────

  private async handleFavToggle(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const added = await toggleFavorite(interaction.user.id, toolName);
    logger.info(`[CC] Favorite ${added ? 'added' : 'removed'}: ${toolName} for ${interaction.user.tag}`);
    await this.navToTool(interaction, guild, toolName);
  }

  // ── Core nav helper ────────────────────────────────────────────────────────

  private async nav(interaction: NavInteraction, payload: object, label: string, extraTimings: Record<string, number> = {}): Promise<void> {
    const t0 = Date.now();

    // Pre-send assertion — catches any duplicate ID before Discord sees it
    assertUniqueCustomIds(`nav:${label}`, payload as { components?: unknown[] });

    const tDefer = Date.now();
    await interaction.deferUpdate();
    const deferMs = Date.now() - tDefer;

    const tEdit = Date.now();
    await interaction.editReply(payload);
    const editMs = Date.now() - tEdit;

    const total = Date.now() - t0;
    const extra = Object.entries(extraTimings).map(([k, v]) => `${k}=${v}ms`).join(' ');
    logger.info(`[CC][timing] nav:${label} total=${total}ms deferUpdate=${deferMs}ms editReply=${editMs}ms${extra ? ' ' + extra : ''}`);
  }

  // ── Error helpers ──────────────────────────────────────────────────────────

  private errorPayload(message: string) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ Control Center Error')
      .setDescription(truncate(message, 2000));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🏠 Home').setCustomId(CC.HOME).setStyle(ButtonStyle.Secondary),
    );
    return { content: '', embeds: [embed], components: [row] };
  }

  /**
   * Guarantees the interaction never hangs on "thinking...": always resolves
   * with an editReply, followUp, or reply carrying a visible error embed.
   * Silently drops stale-interaction errors (10062/40060).
   */
  private async safeErrorReply(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const repliable = interaction as RepliableInteraction;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    const payload = this.errorPayload(message);

    try {
      if (repliable.deferred || repliable.replied) {
        await repliable.editReply(payload).catch(() => repliable.followUp({ ...payload, flags: MessageFlags.Ephemeral }));
      } else {
        await repliable.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    } catch (deliveryErr) {
      if (isStaleInteraction(deliveryErr)) return; // already expired — silently ignore
      logger.error('[CC] Failed to deliver error message to user', deliveryErr);
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
