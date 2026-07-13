import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type Interaction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type RoleSelectMenuInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type Guild,
} from 'discord.js';
import type { PermissionManager } from '../../../ai/permission-manager';
import type { StaffActionType, GoalMetric, GoalPeriod, LeaderboardPeriod } from '../../../community/staff/types';
import { ALL_STAFF_ACTIONS, makeDefaultProfile } from '../../../community/staff/types';
import { staffService } from '../../../community/staff';
import {
  buildOverviewPage,
  buildStaffListPage,
  buildPerformancePage,
  buildWarningsPage,
  buildWarningModal,
  buildNotesPage,
  buildNoteModal,
  buildGoalsPage,
  buildGoalModal,
  buildLeaderboardPage,
  buildReportsPage,
  buildReportChannelSelectRow,
  buildSettingsPage,
  buildInactiveThresholdModal,
  buildPointsPage,
  buildPointsModal,
  type SMPayload,
} from './sm-renderer';
import { SM, isSMInteraction } from './sm-ids';
import { CC } from '../cc-ids';
import { logger } from '../../../utils/logger';

export { isSMInteraction };

const STALE = new Set([10062, 40060]);
function isStale(e: unknown): boolean {
  return !!(e && typeof e === 'object' && 'code' in e && STALE.has((e as { code: number }).code));
}

export class StaffDashboardService {
  constructor(private readonly permissionManager: PermissionManager) {}

  async handleInteraction(interaction: Interaction, guild: Guild): Promise<void> {
    if (!this.isAdmin(interaction)) return;
    try {
      if (interaction.isButton())               await this.routeButton(interaction, guild);
      else if (interaction.isStringSelectMenu()) await this.routeStringSelect(interaction, guild);
      else if (interaction.isRoleSelectMenu())   await this.routeRoleSelect(interaction, guild);
      else if (interaction.isChannelSelectMenu())await this.routeChannelSelect(interaction, guild);
      else if (interaction.isModalSubmit())      await this.routeModal(interaction, guild);
    } catch (err) {
      if (isStale(err)) return;
      logger.error('[StaffDash] interaction error', err);
      await this.safeErr(interaction, err);
    }
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private async routeButton(i: ButtonInteraction, guild: Guild): Promise<void> {
    const id = i.customId;
    if (id === SM.DASH)               return this.showOverview(i, guild);
    if (id === SM.STAFFLIST)          return this.showStaffList(i, guild);
    if (id === SM.GOALS)              return this.showGoals(i, guild);
    if (id === SM.GOAL_ADD)           return void (await i.showModal(buildGoalModal()));
    if (id === SM.REPORTS)            return this.showReports(i, guild);
    if (id === SM.REPORTS_SET_CHANNEL) return void (await this.showChannelSelect(i));
    if (id === SM.SETTINGS)           return this.showSettings(i, guild);
    if (id === SM.SETTINGS_INACTIVE)  return this.showInactiveModal(i, guild);
    if (id === SM.POINTS)             return this.showPoints(i, guild);

    if (id.startsWith('sm:rep:toggle:')) {
      const period = id.split(':')[3] as 'daily' | 'weekly' | 'monthly';
      return this.toggleReport(i, guild, period);
    }
    if (id.startsWith('sm:lb:')) {
      const period = id.split(':')[2] as LeaderboardPeriod;
      return this.showLeaderboard(i, guild, period);
    }
    if (id.startsWith('sm:perf:')) {
      return this.showPerformance(i, guild, id.split(':')[2]);
    }
    if (id.startsWith('sm:warnadd:')) {
      const userId = id.split(':')[2];
      return void (await i.showModal(buildWarningModal(userId)));
    }
    if (id.startsWith('sm:warn:')) {
      return this.showWarnings(i, guild, id.split(':')[2]);
    }
    if (id.startsWith('sm:noteadd:')) {
      const userId = id.split(':')[2];
      return void (await i.showModal(buildNoteModal(userId)));
    }
    if (id.startsWith('sm:notes:')) {
      return this.showNotes(i, guild, id.split(':')[2]);
    }
    return this.showOverview(i, guild);
  }

  private async routeStringSelect(i: StringSelectMenuInteraction, guild: Guild): Promise<void> {
    if (i.customId === SM.STAFF_SELECT) return this.showPerformance(i, guild, i.values[0]);
    if (i.customId === SM.GOAL_DELETE_SEL) return this.deleteGoal(i, guild, i.values[0]);
    if (i.customId === SM.POINTS_SELECT) {
      const action = i.values[0] as StaffActionType;
      const values = await staffService.getPointValues(guild.id);
      await i.showModal(buildPointsModal(action, values[action]));
      return;
    }
  }

  private async routeRoleSelect(i: RoleSelectMenuInteraction, guild: Guild): Promise<void> {
    if (i.customId === SM.SETTINGS_ROLES_SEL) {
      const updated = await staffService.updateSettings(guild.id, { trackedRoleIds: i.values });
      await i.deferUpdate();
      await i.editReply(buildSettingsPage(updated.settings));
    }
  }

  private async routeChannelSelect(i: ChannelSelectMenuInteraction, guild: Guild): Promise<void> {
    if (i.customId === SM.REPORTS_CHANNEL_SEL) {
      const { updateReportConfig, getReportConfig } = await import('../../../community/staff/staff-reports-store');
      await updateReportConfig(guild.id, { channelId: i.values[0] });
      const cfg = await getReportConfig(guild.id);
      await i.deferUpdate();
      await i.editReply(buildReportsPage(cfg));
    }
  }

  private async routeModal(i: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const id = i.customId;
    if (id === SM.GOAL_ADD_M) return this.handleGoalModal(i, guild);
    if (id === SM.SETTINGS_INACTIVE_M) return this.handleInactiveModal(i, guild);
    if (id.startsWith('sm:warnadd:m:')) return this.handleWarningModal(i, guild, id.split(':')[3]);
    if (id.startsWith('sm:noteadd:m:')) return this.handleNoteModal(i, guild, id.split(':')[3]);
    if (id.startsWith('sm:points:m:')) return this.handlePointsModal(i, guild, id.split(':')[3] as StaffActionType);
  }

  // ── Screens ──────────────────────────────────────────────────────────────

  private async showOverview(i: ButtonInteraction, guild: Guild): Promise<void> {
    await i.deferUpdate();
    const [profiles, weeklyLb, goals] = await Promise.all([
      staffService.listProfiles(guild.id),
      staffService.getLeaderboard(guild.id, 'weekly'),
      staffService.listGoals(guild.id),
    ]);
    const topStaff = await Promise.all(
      weeklyLb.slice(0, 3).map(async e => ({ tag: await this.tagFor(guild, e.userId), points: e.points })),
    );
    await i.editReply(buildOverviewPage({
      totalStaff: profiles.length,
      onShiftCount: profiles.filter(p => p.currentShiftStartedAt).length,
      topStaff,
      goalCount: goals.length,
      activeGoalCount: goals.filter(g => !g.completedAt).length,
    }));
  }

  private async showStaffList(i: ButtonInteraction, guild: Guild): Promise<void> {
    await i.deferUpdate();
    const payload = await this.buildStaffListPayload(guild);
    await i.editReply(payload);
  }

  private async buildStaffListPayload(guild: Guild): Promise<SMPayload> {
    const settings = (await staffService.getGuildData(guild.id)).settings;
    const memberIds = new Set<string>();
    if (settings.trackedRoleIds.length > 0) {
      const members = await guild.members.fetch().catch(() => null);
      if (members) {
        for (const member of members.values()) {
          if (member.roles.cache.some(r => settings.trackedRoleIds.includes(r.id))) memberIds.add(member.id);
        }
      }
    }
    // Also include anyone who already has tracked activity, even if their role changed since.
    const profiles = await staffService.listProfiles(guild.id);
    for (const p of profiles) memberIds.add(p.userId);

    const entries = await Promise.all(
      Array.from(memberIds).map(async userId => {
        const profile = (await staffService.getProfile(guild.id, userId)) ?? makeDefaultProfile(guild.id, userId);
        const totalPoints = await staffService.getUserTotalPoints(guild.id, userId);
        return {
          userId,
          tag: await this.tagFor(guild, userId),
          status: profile.status,
          totalPoints,
          lastActivityAt: profile.lastActivityAt,
          onShift: !!profile.currentShiftStartedAt,
        };
      }),
    );
    return buildStaffListPage(entries);
  }

  private async showPerformance(i: ButtonInteraction | StringSelectMenuInteraction, guild: Guild, userId: string): Promise<void> {
    await i.deferUpdate();
    const profile = (await staffService.getProfile(guild.id, userId)) ?? makeDefaultProfile(guild.id, userId);
    const totalPoints = await staffService.getUserTotalPoints(guild.id, userId);
    const tag = await this.tagFor(guild, userId);
    await i.editReply(buildPerformancePage(userId, tag, profile, totalPoints));
  }

  private async showWarnings(i: ButtonInteraction, guild: Guild, userId: string): Promise<void> {
    await i.deferUpdate();
    const profile = (await staffService.getProfile(guild.id, userId)) ?? makeDefaultProfile(guild.id, userId);
    const tag = await this.tagFor(guild, userId);
    await i.editReply(buildWarningsPage(userId, tag, profile));
  }

  private async showNotes(i: ButtonInteraction, guild: Guild, userId: string): Promise<void> {
    await i.deferUpdate();
    const profile = (await staffService.getProfile(guild.id, userId)) ?? makeDefaultProfile(guild.id, userId);
    const tag = await this.tagFor(guild, userId);
    await i.editReply(buildNotesPage(userId, tag, profile));
  }

  private async showGoals(i: ButtonInteraction, guild: Guild): Promise<void> {
    await i.deferUpdate();
    await i.editReply(await this.buildGoalsPayload(guild));
  }

  private async buildGoalsPayload(guild: Guild): Promise<SMPayload> {
    const goals = await staffService.listGoals(guild.id);
    const withProgress = await Promise.all(
      goals.map(async g => ({ ...g, progress: await staffService.computeGoalProgress(g) })),
    );
    return buildGoalsPage(withProgress);
  }

  private async showLeaderboard(i: ButtonInteraction, guild: Guild, period: LeaderboardPeriod): Promise<void> {
    await i.deferUpdate();
    const entries = await staffService.getLeaderboard(guild.id, period);
    const rows = await Promise.all(entries.map(async e => ({ tag: await this.tagFor(guild, e.userId), points: e.points, actionCount: e.actionCount })));
    await i.editReply(buildLeaderboardPage(period, rows));
  }

  private async showReports(i: ButtonInteraction, guild: Guild): Promise<void> {
    await i.deferUpdate();
    const { getReportConfig } = await import('../../../community/staff/staff-reports-store');
    const cfg = await getReportConfig(guild.id);
    await i.editReply(buildReportsPage(cfg));
  }

  private async showChannelSelect(i: ButtonInteraction): Promise<void> {
    await i.reply({
      content: '📬 Select the channel to post staff reports in:',
      components: [buildReportChannelSelectRow()],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async showSettings(i: ButtonInteraction, guild: Guild): Promise<void> {
    await i.deferUpdate();
    const { settings } = await staffService.getGuildData(guild.id);
    await i.editReply(buildSettingsPage(settings));
  }

  private async showInactiveModal(i: ButtonInteraction, guild: Guild): Promise<void> {
    const { settings } = await staffService.getGuildData(guild.id);
    await i.showModal(buildInactiveThresholdModal(settings.inactiveThresholdDays));
  }

  private async showPoints(i: ButtonInteraction, guild: Guild): Promise<void> {
    await i.deferUpdate();
    const values = await staffService.getPointValues(guild.id);
    await i.editReply(buildPointsPage(values));
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  private async toggleReport(i: ButtonInteraction, guild: Guild, period: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    const { getReportConfig, updateReportConfig } = await import('../../../community/staff/staff-reports-store');
    const cfg = await getReportConfig(guild.id);
    const key = period === 'daily' ? 'dailyEnabled' : period === 'weekly' ? 'weeklyEnabled' : 'monthlyEnabled';
    const updated = await updateReportConfig(guild.id, { [key]: !cfg[key] });
    await i.deferUpdate();
    await i.editReply(buildReportsPage(updated));
  }

  private async deleteGoal(i: StringSelectMenuInteraction, guild: Guild, goalId: string): Promise<void> {
    await staffService.deleteGoal(guild.id, goalId);
    await i.deferUpdate();
    await i.editReply(await this.buildGoalsPayload(guild));
  }

  private async handleGoalModal(i: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const label = i.fields.getTextInputValue('label').trim();
    const metricRaw = i.fields.getTextInputValue('metric').trim() as GoalMetric;
    const targetRaw = i.fields.getTextInputValue('target').trim();
    const periodRaw = i.fields.getTextInputValue('period').trim().toLowerCase() as GoalPeriod;

    const target = parseInt(targetRaw, 10);
    const validMetric = [...ALL_STAFF_ACTIONS, 'points', 'shift_hours'].includes(metricRaw);
    const validPeriod = ['daily', 'weekly', 'monthly', 'alltime'].includes(periodRaw);

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (!label || isNaN(target) || target <= 0 || !validMetric || !validPeriod) {
      await i.editReply({ content: '❌ Invalid goal. Check the metric key, target (positive number), and period (daily/weekly/monthly/alltime).' });
      return;
    }

    await staffService.createGoal(guild.id, label, metricRaw, target, periodRaw, i.user.id);
    await i.editReply({ content: `✅ Goal **${label}** created.` });
    try { if (i.message) await i.message.edit(await this.buildGoalsPayload(guild)); } catch { /* non-fatal */ }
  }

  private async handleInactiveModal(i: ModalSubmitInteraction, guild: Guild): Promise<void> {
    const raw = i.fields.getTextInputValue('days').trim();
    const days = Math.max(1, Math.min(365, parseInt(raw, 10) || 14));
    const updated = await staffService.updateSettings(guild.id, { inactiveThresholdDays: days });

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await i.editReply({ content: `✅ Inactive threshold set to **${days}** day(s).` });
    try { if (i.message) await i.message.edit(buildSettingsPage(updated.settings)); } catch { /* non-fatal */ }
  }

  private async handleWarningModal(i: ModalSubmitInteraction, guild: Guild, userId: string): Promise<void> {
    const reason = i.fields.getTextInputValue('reason').trim();
    await staffService.addWarning(guild.id, userId, reason, i.user.id, i.user.tag);

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await i.editReply({ content: `✅ Warning issued to <@${userId}>.` });
    try {
      if (i.message) {
        const profile = (await staffService.getProfile(guild.id, userId)) ?? makeDefaultProfile(guild.id, userId);
        const tag = await this.tagFor(guild, userId);
        await i.message.edit(buildWarningsPage(userId, tag, profile));
      }
    } catch { /* non-fatal */ }
  }

  private async handleNoteModal(i: ModalSubmitInteraction, guild: Guild, userId: string): Promise<void> {
    const content = i.fields.getTextInputValue('content').trim();
    await staffService.addNote(guild.id, userId, i.user.id, i.user.tag, content);

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await i.editReply({ content: `✅ Note added for <@${userId}>.` });
    try {
      if (i.message) {
        const profile = (await staffService.getProfile(guild.id, userId)) ?? makeDefaultProfile(guild.id, userId);
        const tag = await this.tagFor(guild, userId);
        await i.message.edit(buildNotesPage(userId, tag, profile));
      }
    } catch { /* non-fatal */ }
  }

  private async handlePointsModal(i: ModalSubmitInteraction, guild: Guild, action: StaffActionType): Promise<void> {
    const raw = i.fields.getTextInputValue('points').trim();
    const points = parseInt(raw, 10);

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (isNaN(points)) {
      await i.editReply({ content: '❌ Invalid point value.' });
      return;
    }
    const values = await staffService.setPointValue(guild.id, action, points);
    await i.editReply({ content: `✅ Point value updated.` });
    try { if (i.message) await i.message.edit(buildPointsPage(values)); } catch { /* non-fatal */ }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async tagFor(guild: Guild, userId: string): Promise<string> {
    try {
      const member = await guild.members.fetch(userId);
      return member.user.tag;
    } catch {
      return `<@${userId}>`;
    }
  }

  private isAdmin(interaction: Interaction): boolean {
    if (!interaction.guild || !interaction.member) return false;
    try { return this.permissionManager.isAdmin(interaction.member as GuildMember); } catch { return false; }
  }

  private async safeErr(interaction: Interaction, err: unknown): Promise<void> {
    if (!interaction.isRepliable()) return;
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('❌ Staff Dashboard Error').setDescription(msg);
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
