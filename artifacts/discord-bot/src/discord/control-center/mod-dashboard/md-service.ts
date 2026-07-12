import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type Interaction,
  type ButtonInteraction,
  type RoleSelectMenuInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type Guild,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import type { AutoPunishThreshold, ModerationAction } from '../../../community/moderation/types';
import { parseDuration } from '../../../community/moderation/types';
import { getGuildModConfig, updateGuildModConfig } from '../../../community/moderation/mod-config-store';
import {
  buildModDashboard,
  buildAutoPunishModal,
  buildPrefixModal,
  buildReasonsModal,
} from './md-renderer';
import { MD, isMDInteraction } from './md-ids';
import { CC } from '../cc-ids';
import { logger } from '../../../utils/logger';

export { isMDInteraction };

const STALE = new Set([10062, 40060]);
function isStale(e: unknown): boolean {
  return !!(e && typeof e === 'object' && 'code' in e && STALE.has((e as { code: number }).code));
}

export class ModDashboardService {
  constructor(private readonly permissionManager: PermissionManager) {}

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.isAdmin(interaction)) return;
    try {
      if (interaction.isButton())               await this.routeButton(interaction, guild);
      else if (interaction.isRoleSelectMenu())   await this.routeRoleSelect(interaction, guild);
      else if (interaction.isModalSubmit())       await this.routeModal(interaction, guild);
    } catch (err) {
      if (isStale(err)) return;
      logger.error('[ModDash] interaction error', err);
      await this.safeErr(interaction, err);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────

  private async routeButton(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    switch (interaction.customId) {
      case MD.DASH:              return this.showDash(interaction, guild);
      case MD.TOGGLE_DM:         return this.toggleDM(interaction, guild);
      case MD.TOGGLE_AUTOPUNISH: return this.toggleAutoPunish(interaction, guild);
      case MD.SET_AUTOPUNISH:    return this.showAutoPunishModal(interaction, guild);
      case MD.SET_PREFIX:        return this.showPrefixModal(interaction, guild);
      case MD.SET_REASONS:       return this.showReasonsModal(interaction, guild);
      default: return this.showDash(interaction, guild);
    }
  }

  private async routeRoleSelect(interaction: RoleSelectMenuInteraction, guild: Guild): Promise<void> {
    if (interaction.customId === MD.ROLE_SEL) {
      return this.handleRoleSelect(interaction, guild);
    }
  }

  private async routeModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    switch (interaction.customId) {
      case MD.SET_AUTOPUNISH_M: return this.handleAutoPunishModal(interaction, guild);
      case MD.SET_PREFIX_M:     return this.handlePrefixModal(interaction, guild);
      case MD.SET_REASONS_M:    return this.handleReasonsModal(interaction, guild);
    }
  }

  // ── Screens ────────────────────────────────────────────────────────────

  private async showDash(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildModConfig(guild.id);
    await interaction.deferUpdate();
    await interaction.editReply(buildModDashboard(cfg));
  }

  // ── Actions ────────────────────────────────────────────────────────────

  private async toggleDM(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildModConfig(guild.id);
    const updated = await updateGuildModConfig(guild.id, { dmOnPunish: !cfg.dmOnPunish });
    await interaction.deferUpdate();
    await interaction.editReply(buildModDashboard(updated));
  }

  private async toggleAutoPunish(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildModConfig(guild.id);
    const updated = await updateGuildModConfig(guild.id, {
      autoPunish: { ...cfg.autoPunish, enabled: !cfg.autoPunish.enabled },
    });
    await interaction.deferUpdate();
    await interaction.editReply(buildModDashboard(updated));
  }

  private async showAutoPunishModal(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildModConfig(guild.id);
    await interaction.showModal(buildAutoPunishModal(cfg));
  }

  private async showPrefixModal(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildModConfig(guild.id);
    await interaction.showModal(buildPrefixModal(cfg));
  }

  private async showReasonsModal(interaction: ButtonInteraction, guild: Guild): Promise<void> {
    const cfg = await getGuildModConfig(guild.id);
    await interaction.showModal(buildReasonsModal(cfg));
  }

  private async handleRoleSelect(interaction: RoleSelectMenuInteraction, guild: Guild): Promise<void> {
    const roleIds = interaction.values;
    const updated = await updateGuildModConfig(guild.id, { modRoles: roleIds });
    await interaction.deferUpdate();
    await interaction.editReply(buildModDashboard(updated));
  }

  private async handleAutoPunishModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const raw = interaction.fields.getTextInputValue('thresholds').trim();
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const thresholds: AutoPunishThreshold[] = [];

    for (const line of lines) {
      // Format: <warns> <timeout|kick|ban> [duration]
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const warns = parseInt(parts[0], 10);
      if (isNaN(warns) || warns <= 0) continue;
      const action = parts[1].toLowerCase() as 'timeout' | 'kick' | 'ban';
      if (!['timeout', 'kick', 'ban'].includes(action)) continue;
      const duration = parts[2] ? parseDuration(parts[2]) ?? undefined : undefined;
      thresholds.push({ warns, action, duration });
    }

    const cfg = await getGuildModConfig(guild.id);
    const updated = await updateGuildModConfig(guild.id, {
      autoPunish: { ...cfg.autoPunish, thresholds },
    });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      content: `✅ Auto-punishment thresholds updated (${thresholds.length} threshold(s)).`,
    });
    try { if (interaction.message) await interaction.message.edit(buildModDashboard(updated)); } catch { /* non-fatal */ }
  }

  private async handlePrefixModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const raw = interaction.fields.getTextInputValue('prefix').trim().toUpperCase();
    const prefix = raw.replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'MOD';

    const updated = await updateGuildModConfig(guild.id, { casePrefix: prefix });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({ content: `✅ Case prefix set to \`${prefix}\`.` });
    try { if (interaction.message) await interaction.message.edit(buildModDashboard(updated)); } catch { /* non-fatal */ }
  }

  private async handleReasonsModal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const raw = interaction.fields.getTextInputValue('reasons').trim();
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const defaultReasons: Partial<Record<ModerationAction, string>> = {};

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toLowerCase() as ModerationAction;
      const val = line.slice(colonIdx + 1).trim();
      if (val) defaultReasons[key] = val;
    }

    const updated = await updateGuildModConfig(guild.id, { defaultReasons });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({ content: `✅ Default reasons updated (${Object.keys(defaultReasons).length} set).` });
    try { if (interaction.message) await interaction.message.edit(buildModDashboard(updated)); } catch { /* non-fatal */ }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private isAdmin(interaction: Interaction): boolean {
    if (!interaction.guild || !interaction.member) return false;
    try { return this.permissionManager.isAdmin(interaction.member as GuildMember); } catch { return false; }
  }

  private async safeErr(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('❌ Mod Dashboard Error').setDescription(msg);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🏠 Home').setCustomId(CC.HOME).setStyle(ButtonStyle.Secondary),
    );
    try {
      if ((interaction as ButtonInteraction).deferred || (interaction as ButtonInteraction).replied) {
        await (interaction as ButtonInteraction).editReply({ embeds: [embed], components: [row] });
      } else {
        await (interaction as ButtonInteraction).reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
      }
    } catch { /* terminal */ }
  }
}
