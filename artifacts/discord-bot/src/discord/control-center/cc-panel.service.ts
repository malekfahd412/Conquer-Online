import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type {
  Guild,
  GuildMember,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ChatInputCommandInteraction,
  Interaction,
  RepliableInteraction,
} from 'discord.js';
import type { ToolRegistry } from '../../ai/tool-registry';
import type { PermissionManager } from '../../ai/permission-manager';
import { truncate } from './cc-categories';
import type { CategoryKey } from './cc-categories';
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
} from './cc-renderer';
import { getFavorites, toggleFavorite, isFavorite } from './cc-favorites';
import { logger } from '../../utils/logger';

type NavInteraction = ButtonInteraction | StringSelectMenuInteraction;

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
      // Requirement: deferReply is the very first operation on the interaction.
      let t = Date.now();
      await interaction.deferReply({ ephemeral: true });
      timings.deferReply = Date.now() - t;

      if (!interaction.guild) {
        await interaction.editReply(this.errorPayload('❌ Control Center only works inside a server.'));
        return;
      }
      if (!this.isAdmin(interaction)) {
        await interaction.editReply(this.errorPayload('❌ You do not have permission to use the Control Center.'));
        return;
      }

      // Registry load — cache was already built at startup, so this is a lookup, not a rebuild.
      t = Date.now();
      const toolCount = this.cache.toolCount;
      timings.registryLoad = Date.now() - t;

      // Category generation — dashboard only needs per-category counts, not full tool lists.
      t = Date.now();
      const counts = this.cache.categoryCounts;
      timings.categoryGen = Date.now() - t;

      // UI generation — build the dashboard payload only (lazy: no per-tool rendering here).
      t = Date.now();
      const payload = buildDashboard(toolCount, counts);
      timings.uiGen = Date.now() - t;

      // Favorites / search index are not needed for the dashboard screen — lazy-loaded later.
      timings.favorites = 0;
      timings.searchIndex = 0;

      t = Date.now();
      timings.rendering = Date.now() - t; // payload already built above; embeds/components are cheap object graphs

      t = Date.now();
      await interaction.editReply(payload);
      timings.editReply = Date.now() - t;

      const total = Date.now() - t0;
      logger.info(
        `[CC][timing] /panel total=${total}ms defer=${timings.deferReply}ms registry=${timings.registryLoad}ms ` +
        `categoryGen=${timings.categoryGen}ms uiGen=${timings.uiGen}ms editReply=${timings.editReply}ms tools=${toolCount}`,
      );
    } catch (err) {
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
      } else if (interaction.isModalSubmit()) {
        await this.routeModal(interaction, guild);
      }
    } catch (err) {
      logger.error('[CC] Interaction routing failed', err);
      await this.safeErrorReply(interaction, err);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === 'cc:home' || id === 'cc:cancel') {
      await this.nav(interaction, this.buildDashboardPayload(), 'home');
      return;
    }
    if (id === 'cc:favs') {
      await this.navToFavorites(interaction);
      return;
    }
    if (id === 'cc:srch') {
      await interaction.showModal(buildSearchModal());
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
      await this.navToTool(interaction, guild, parts[2]);
      return;
    }
    if (action === 'exec') {
      await this.handleExecute(interaction, guild, parts[2]);
      return;
    }
    if (action === 'do') {
      await this.handleConfirmedExec(interaction, guild, parts[2]);
      return;
    }
    if (action === 'fav') {
      await this.handleFavToggle(interaction, guild, parts[2]);
      return;
    }
  }

  private async routeSelectMenu(interaction: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;
    const value = interaction.values[0];

    if (id === 'cc:cs') {
      await this.navToCategory(interaction, value as CategoryKey, 0);
      return;
    }

    if (id.startsWith('cc:ts:')) {
      await this.navToTool(interaction, guild, value);
      return;
    }
  }

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === 'cc:search_submit') {
      await this.handleSearch(interaction);
      return;
    }
    if (id.startsWith('cc:modal:')) {
      const toolName = id.slice('cc:modal:'.length);
      await this.handleModalExec(interaction, guild, toolName);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  private buildDashboardPayload() {
    // Cached at startup — no per-tool iteration happens here anymore.
    return buildDashboard(this.cache.toolCount, this.cache.categoryCounts);
  }

  private async navToCategory(interaction: NavInteraction, category: CategoryKey, page: number): Promise<void> {
    const tUi = Date.now();
    const tools = this.cache.getToolsByCategory(category); // lazy: tools for THIS category only, from cache
    const safePage = Math.max(0, Math.min(page, Math.floor((tools.length - 1) / 20)));
    const payload = buildCategoryPanel(category, tools, safePage);
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

  // ── Execution ──────────────────────────────────────────────────────────────

  private async handleExecute(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) { await this.nav(interaction, this.buildDashboardPayload(), 'home'); return; }

    const hasParams = Object.keys(tool.definition.parameters.properties ?? {}).length > 0;

    if (hasParams) {
      await interaction.showModal(buildToolModal(tool));
      return;
    }

    // No params — execute directly or show danger confirm
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
      await interaction.reply({ content: '❌ Tool not found.', ephemeral: true });
      return;
    }

    const params = this.parseModalParams(interaction, tool);

    if (tool.definition.dangerous) {
      const key = `${interaction.user.id}:${toolName}`;
      const paramSummary = Object.entries(params).map(([k, v]) => `**${k}:** ${String(v)}`).join('\n') || '_None_';
      this.pendingExec.set(key, { toolName, params, category: this.cache.getCategory(toolName) });

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(buildConfirm(tool, paramSummary, this.cache.getCategory(toolName)));
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await this.runTool(toolName, params, guild);
    const category = this.cache.getCategory(toolName);
    await interaction.editReply(buildResult(toolName, result, category));
  }

  private async executeTool(
    interaction: ButtonInteraction,
    guild: Guild,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.runTool(toolName, params, guild);
    const category = this.cache.getCategory(toolName);
    await interaction.editReply(buildResult(toolName, result, category));
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
    const tools = this.cache.search(query); // uses the precomputed search index, not a fresh scan
    const searchMs = Date.now() - tSearch;

    const tDefer = Date.now();
    await interaction.deferReply({ ephemeral: true });
    const deferMs = Date.now() - tDefer;

    const tEdit = Date.now();
    await interaction.editReply(buildSearchResults(query, tools));
    const editMs = Date.now() - tEdit;

    logger.info(`[CC][timing] search query="${query}" searchIndex=${searchMs}ms defer=${deferMs}ms editReply=${editMs}ms results=${tools.length}`);
  }

  // ── Favorites ──────────────────────────────────────────────────────────────

  private async handleFavToggle(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const added = await toggleFavorite(interaction.user.id, toolName);
    logger.info(`[CC] Favorite ${added ? 'added' : 'removed'}: ${toolName} for ${interaction.user.tag}`);
    await this.navToTool(interaction, guild, toolName);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async nav(interaction: NavInteraction, payload: object, label: string, extraTimings: Record<string, number> = {}): Promise<void> {
    const t0 = Date.now();
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

  private errorPayload(message: string) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ Control Center Error')
      .setDescription(truncate(message, 2000));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🏠 Home').setCustomId('cc:home').setStyle(ButtonStyle.Secondary),
    );
    return { content: '', embeds: [embed], components: [row] };
  }

  /**
   * Guarantees the interaction never hangs on "thinking...": always resolves
   * with an editReply, followUp, or reply carrying a visible error embed.
   */
  private async safeErrorReply(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const repliable = interaction as RepliableInteraction;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    const payload = this.errorPayload(message);

    try {
      if (repliable.deferred || repliable.replied) {
        await repliable.editReply(payload).catch(() => repliable.followUp({ ...payload, ephemeral: true }));
      } else {
        await repliable.reply({ ...payload, ephemeral: true });
      }
    } catch (deliveryErr) {
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
