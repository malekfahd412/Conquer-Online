import type {
  Guild,
  GuildMember,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ChatInputCommandInteraction,
  Interaction,
} from 'discord.js';
import type { ToolRegistry } from '../../ai/tool-registry';
import type { PermissionManager } from '../../ai/permission-manager';
import { inferCategory } from './cc-categories';
import type { CategoryKey } from './cc-categories';
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

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly permissionManager: PermissionManager,
  ) {}

  // ── Entry Points ───────────────────────────────────────────────────────────

  async handlePanelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ Control Center only works inside a server.', ephemeral: true });
      return;
    }
    if (!this.isAdmin(interaction)) {
      await interaction.reply({ content: '❌ You do not have permission to use the Control Center.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(this.buildDashboardPayload());
  }

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.isAdmin(interaction)) return;

    if (interaction.isButton()) {
      await this.routeButton(interaction, guild);
    } else if (interaction.isStringSelectMenu()) {
      await this.routeSelectMenu(interaction, guild);
    } else if (interaction.isModalSubmit()) {
      await this.routeModal(interaction, guild);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const id = interaction.customId;

    if (id === 'cc:home' || id === 'cc:cancel') {
      await this.nav(interaction, this.buildDashboardPayload());
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
    const all = this.toolRegistry.getAll();
    const counts: Partial<Record<CategoryKey, number>> = {};
    for (const tool of all) {
      const cat = inferCategory(tool.definition.name);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return buildDashboard(all.length, counts);
  }

  private async navToCategory(interaction: NavInteraction, category: CategoryKey, page: number): Promise<void> {
    const tools = this.toolsByCategory(category);
    const safePage = Math.max(0, Math.min(page, Math.floor((tools.length - 1) / 20)));
    await this.nav(interaction, buildCategoryPanel(category, tools, safePage));
  }

  private async navToTool(interaction: NavInteraction, _guild: Guild, toolName: string): Promise<void> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      await this.nav(interaction, this.buildDashboardPayload());
      return;
    }
    const category = inferCategory(toolName);
    const fav = await isFavorite(interaction.user.id, toolName);
    await this.nav(interaction, buildToolDetail(tool, category, fav));
  }

  private async navToFavorites(interaction: NavInteraction): Promise<void> {
    const favNames = await getFavorites(interaction.user.id);
    const tools = favNames.map(n => this.toolRegistry.getTool(n)).filter(Boolean) as NonNullable<ReturnType<ToolRegistry['getTool']>>[];
    await this.nav(interaction, buildFavoritesPanel(tools));
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  private async handleExecute(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) { await this.nav(interaction, this.buildDashboardPayload()); return; }

    const hasParams = Object.keys(tool.definition.parameters.properties ?? {}).length > 0;

    if (hasParams) {
      await interaction.showModal(buildToolModal(tool));
      return;
    }

    // No params — execute directly or show danger confirm
    if (tool.definition.dangerous) {
      const key = `${interaction.user.id}:${toolName}`;
      this.pendingExec.set(key, { toolName, params: {}, category: inferCategory(toolName) });
      await this.nav(interaction, buildConfirm(tool, '_None_', inferCategory(toolName)));
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
      this.pendingExec.set(key, { toolName, params, category: inferCategory(toolName) });

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(buildConfirm(tool, paramSummary, inferCategory(toolName)));
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await this.runTool(toolName, params, guild);
    const category = inferCategory(toolName);
    await interaction.editReply(buildResult(toolName, result, category));
  }

  private async executeTool(
    interaction: ButtonInteraction,
    guild: Guild,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.runTool(toolName, params, guild);
    const category = inferCategory(toolName);
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
    const tools = this.toolRegistry.search(query);
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(buildSearchResults(query, tools));
  }

  // ── Favorites ──────────────────────────────────────────────────────────────

  private async handleFavToggle(interaction: ButtonInteraction, guild: Guild, toolName: string): Promise<void> {
    const added = await toggleFavorite(interaction.user.id, toolName);
    logger.info(`[CC] Favorite ${added ? 'added' : 'removed'}: ${toolName} for ${interaction.user.tag}`);
    await this.navToTool(interaction, guild, toolName);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private toolsByCategory(category: CategoryKey) {
    return this.toolRegistry.getAll()
      .filter(t => inferCategory(t.definition.name) === category)
      .sort((a, b) => a.definition.name.localeCompare(b.definition.name));
  }

  private async nav(interaction: NavInteraction, payload: object): Promise<void> {
    await interaction.deferUpdate();
    await interaction.editReply(payload);
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
