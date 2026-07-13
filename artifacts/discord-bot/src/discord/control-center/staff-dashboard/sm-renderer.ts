import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  StaffProfile,
  StaffGuildSettings,
  StaffGoal,
  StaffActionType,
  LeaderboardPeriod,
  StaffReportsGuildData,
} from '../../../community/staff/types';
import { STAFF_ACTION_LABELS, ALL_STAFF_ACTIONS } from '../../../community/staff/types';
import { formatDurationMs } from '../../../community/staff/embeds';
import { SM } from './sm-ids';
import { CC } from '../cc-ids';

type AnyRow =
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<StringSelectMenuBuilder>
  | ActionRowBuilder<RoleSelectMenuBuilder>
  | ActionRowBuilder<ChannelSelectMenuBuilder>;

export interface SMPayload {
  content: string;
  embeds: EmbedBuilder[];
  components: AnyRow[];
}

function btn(label: string, id: string, style: ButtonStyle, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setLabel(label).setCustomId(id).setStyle(style).setDisabled(disabled);
}

function nav(showDash = true): ActionRowBuilder<ButtonBuilder> {
  const buttons = [btn('🏠 Home', CC.HOME, ButtonStyle.Secondary)];
  if (showDash) buttons.push(btn('👮 Staff Dashboard', SM.DASH, ButtonStyle.Secondary));
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

// ── Overview ─────────────────────────────────────────────────────────────────

export interface OverviewData {
  totalStaff: number;
  onShiftCount: number;
  topStaff: { tag: string; points: number }[];
  goalCount: number;
  activeGoalCount: number;
}

export function buildOverviewPage(data: OverviewData): SMPayload {
  const topLines = data.topStaff.length
    ? data.topStaff.map((e, i) => `**${i + 1}.** ${e.tag} — ${e.points} pts`).join('\n')
    : '_No activity recorded yet this week_';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👮 Staff Management Pro')
    .setDescription('Track staff activity, performance, shifts, points, goals, and reports.')
    .addFields(
      { name: '👥 Tracked Staff', value: `${data.totalStaff}`, inline: true },
      { name: '🟢 On Shift Now', value: `${data.onShiftCount}`, inline: true },
      { name: '🎯 Goals', value: `${data.activeGoalCount} active / ${data.goalCount} total`, inline: true },
      { name: '🏆 Top Staff This Week', value: topLines, inline: false },
    )
    .setFooter({ text: 'Use the buttons below to navigate' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📋 Staff List', SM.STAFFLIST, ButtonStyle.Primary),
    btn('🏆 Leaderboard', SM.leaderboard('weekly'), ButtonStyle.Primary),
    btn('🎯 Goals', SM.GOALS, ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📊 Reports', SM.REPORTS, ButtonStyle.Secondary),
    btn('💎 Point Values', SM.POINTS, ButtonStyle.Secondary),
    btn('⚙️ Settings', SM.SETTINGS, ButtonStyle.Secondary),
  );

  return { content: '', embeds: [embed], components: [row1, row2, nav(false)] };
}

// ── Staff List ───────────────────────────────────────────────────────────────

export interface StaffListEntry {
  userId: string;
  tag: string;
  status: StaffProfile['status'];
  totalPoints: number;
  lastActivityAt: number;
  onShift: boolean;
}

const STATUS_EMOJI: Record<StaffProfile['status'], string> = { active: '🟢', inactive: '⚪', on_leave: '🌴' };

export function buildStaffListPage(entries: StaffListEntry[]): SMPayload {
  const lines = entries.length
    ? entries
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 20)
        .map(e => `${STATUS_EMOJI[e.status]} ${e.onShift ? '🕐' : ''} **${e.tag}** — ${e.totalPoints} pts — <t:${Math.floor(e.lastActivityAt / 1000)}:R>`)
        .join('\n')
    : '_No tracked staff yet. Configure tracked roles under Settings._';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Staff List')
    .setDescription(lines)
    .setFooter({ text: 'Select a staff member below to view their performance page' });

  const components: AnyRow[] = [];
  if (entries.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(SM.STAFF_SELECT)
      .setPlaceholder('👤 Select a staff member...')
      .addOptions(
        entries.slice(0, 25).map(e => ({
          label: e.tag.slice(0, 100),
          value: e.userId,
          description: `${e.totalPoints} pts — ${e.status}`.slice(0, 100),
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(nav());
  return { content: '', embeds: [embed], components };
}

// ── Performance ──────────────────────────────────────────────────────────────

export function buildPerformancePage(userId: string, tag: string, profile: StaffProfile, totalPoints: number): SMPayload {
  const avgResponse = profile.firstResponseSamples
    ? formatDurationMs(profile.firstResponseTotalMs / profile.firstResponseSamples)
    : '_No data_';
  const avgResolution = profile.resolutionSamples
    ? formatDurationMs(profile.resolutionTotalMs / profile.resolutionSamples)
    : '_No data_';

  const c = profile.counts;
  const statLines = [
    `🎫 Claimed: **${c.ticket_claimed}** | Closed: **${c.ticket_closed}** | Reopened: **${c.ticket_reopened}**`,
    `⚠️ Warns: **${c.warn_issued}** | 🔇 Mutes: **${c.mute_issued}** | 👢 Kicks: **${c.kick_issued}**`,
    `🔨 Bans: **${c.ban_issued}** | ⏳ Tempbans: **${c.tempban_issued}** | 🧹 Softbans: **${c.softban_issued}**`,
    `🗑️ Purges: **${c.purge_issued}** | ✅ Verif. Approved: **${c.verification_approved}** | ❌ Rejected: **${c.verification_rejected}**`,
    `🛡️ Security: **${c.security_action}** | 🔊 Voice Mod: **${c.voice_mod_action}**`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📈 Performance — ${tag}`)
    .addFields(
      { name: 'Status', value: `${STATUS_EMOJI[profile.status]} ${profile.status}`, inline: true },
      { name: 'Total Points (all-time)', value: `${totalPoints}`, inline: true },
      { name: 'Total Tracked Activity', value: formatDurationMs(profile.totalActivityMs), inline: true },
      { name: 'On Shift', value: profile.currentShiftStartedAt ? '🟢 Yes' : '⚪ No', inline: true },
      { name: 'Avg First Response', value: avgResponse, inline: true },
      { name: 'Avg Resolution Time', value: avgResolution, inline: true },
      { name: 'Action Counts', value: statLines, inline: false },
      { name: 'Warnings', value: `${profile.warnings.length}`, inline: true },
      { name: 'Private Notes', value: `${profile.notes.length}`, inline: true },
    )
    .setFooter({ text: `Last active ${new Date(profile.lastActivityAt).toUTCString()}` });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('⚠️ Warnings', SM.warnings(userId), ButtonStyle.Danger),
    btn('📝 Notes', SM.notes(userId), ButtonStyle.Secondary),
    btn('📋 Back to Staff List', SM.STAFFLIST, ButtonStyle.Secondary),
  );

  return { content: '', embeds: [embed], components: [row1, nav()] };
}

// ── Warnings ─────────────────────────────────────────────────────────────────

export function buildWarningsPage(userId: string, tag: string, profile: StaffProfile): SMPayload {
  const lines = profile.warnings.length
    ? profile.warnings
        .slice(0, 15)
        .map(w => `<t:${Math.floor(w.timestamp / 1000)}:d>` + ` by ${w.moderatorTag} — ${w.reason}`)
        .join('\n')
    : '_No warnings on record._';

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`⚠️ Staff Warnings — ${tag}`)
    .setDescription(lines);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('➕ Issue Warning', SM.warnAdd(userId), ButtonStyle.Danger),
    btn('◀️ Back', SM.perf(userId), ButtonStyle.Secondary),
  );

  return { content: '', embeds: [embed], components: [row, nav()] };
}

export function buildWarningModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SM.warnAddModal(userId))
    .setTitle('Issue Staff Warning')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Why is this staff member being warned?')
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
}

// ── Notes (manager-only) ─────────────────────────────────────────────────────

export function buildNotesPage(userId: string, tag: string, profile: StaffProfile): SMPayload {
  const lines = profile.notes.length
    ? profile.notes
        .slice(0, 15)
        .map(n => `<t:${Math.floor(n.timestamp / 1000)}:d>` + ` by ${n.authorTag} — ${n.content}`)
        .join('\n')
    : '_No private notes on record._';

  const embed = new EmbedBuilder()
    .setColor(0x99aab5)
    .setTitle(`📝 Private Notes — ${tag}`)
    .setDescription(lines)
    .setFooter({ text: 'Only visible to managers (Administrators)' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('➕ Add Note', SM.noteAdd(userId), ButtonStyle.Primary),
    btn('◀️ Back', SM.perf(userId), ButtonStyle.Secondary),
  );

  return { content: '', embeds: [embed], components: [row, nav()] };
}

export function buildNoteModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SM.noteAddModal(userId))
    .setTitle('Add Private Staff Note')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Note (managers only)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(800),
      ),
    );
}

// ── Goals ────────────────────────────────────────────────────────────────────

export function buildGoalsPage(goals: (StaffGoal & { progress: number })[]): SMPayload {
  const lines = goals.length
    ? goals.map(g => {
        const pct = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
        const status = g.completedAt ? '✅ Complete' : `${pct}%`;
        return `**${g.label}** (${g.period}) — ${Math.round(g.progress)}/${g.target} — ${status}`;
      }).join('\n')
    : '_No goals configured yet._';

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎯 Staff Goals')
    .setDescription(lines);

  const components: AnyRow[] = [];
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('➕ Add Goal', SM.GOAL_ADD, ButtonStyle.Success),
  );
  components.push(row1);

  if (goals.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(SM.GOAL_DELETE_SEL)
      .setPlaceholder('🗑️ Select a goal to delete...')
      .addOptions(goals.slice(0, 25).map(g => ({ label: g.label.slice(0, 100), value: g.id })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(nav());
  return { content: '', embeds: [embed], components };
}

export function buildGoalModal(): ModalBuilder {
  const metricList = [...ALL_STAFF_ACTIONS, 'points', 'shift_hours'].join(', ');
  return new ModalBuilder()
    .setCustomId(SM.GOAL_ADD_M)
    .setTitle('Add Staff Goal')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('label').setLabel('Goal label (e.g. "Close 30 tickets")')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('metric').setLabel(`Metric key`)
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)
          .setPlaceholder('ticket_closed')
          .setValue('ticket_closed'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('target').setLabel('Target number').setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(10).setPlaceholder('30'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('period').setLabel('Period: daily, weekly, monthly, or alltime')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue('weekly'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('metric_help').setLabel(`Valid metric keys (reference only)`)
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(metricList.slice(0, 500)),
      ),
    );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardRow {
  tag: string;
  points: number;
  actionCount: number;
}

const PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', alltime: 'All-Time',
};

export function buildLeaderboardPage(period: LeaderboardPeriod, rows: LeaderboardRow[]): SMPayload {
  const lines = rows.length
    ? rows.slice(0, 15).map((r, i) => `**${i + 1}.** ${r.tag} — ${r.points} pts (${r.actionCount} actions)`).join('\n')
    : '_No activity in this period._';

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🏆 ${PERIOD_LABEL[period]} Leaderboard`)
    .setDescription(lines);

  const periods: LeaderboardPeriod[] = ['daily', 'weekly', 'monthly', 'alltime'];
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...periods.map(p => btn(PERIOD_LABEL[p], SM.leaderboard(p), p === period ? ButtonStyle.Success : ButtonStyle.Secondary)),
  );

  return { content: '', embeds: [embed], components: [row1, nav()] };
}

// ── Reports ──────────────────────────────────────────────────────────────────

export function buildReportsPage(cfg: StaffReportsGuildData): SMPayload {
  const channelValue = cfg.channelId ? `<#${cfg.channelId}>` : '_Not set_';
  const historyLines = cfg.history.slice(0, 5).map(h => `\`${h.type}\` <t:${Math.floor(h.generatedAt / 1000)}:R>`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 Staff Reports')
    .addFields(
      { name: 'Report Channel', value: channelValue, inline: true },
      { name: 'Daily', value: cfg.dailyEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Weekly', value: cfg.weeklyEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Monthly', value: cfg.monthlyEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Recent Reports', value: historyLines || '_None generated yet_', inline: false },
    )
    .setFooter({ text: 'A report channel must be set before schedules will post' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(cfg.dailyEnabled ? '📅 Daily: ON' : '📅 Daily: OFF', SM.reportToggle('daily'), cfg.dailyEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    btn(cfg.weeklyEnabled ? '🗓️ Weekly: ON' : '🗓️ Weekly: OFF', SM.reportToggle('weekly'), cfg.weeklyEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    btn(cfg.monthlyEnabled ? '📆 Monthly: ON' : '📆 Monthly: OFF', SM.reportToggle('monthly'), cfg.monthlyEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('📬 Set Report Channel', SM.REPORTS_SET_CHANNEL, ButtonStyle.Primary),
  );

  return { content: '', embeds: [embed], components: [row1, row2, nav()] };
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function buildSettingsPage(settings: StaffGuildSettings): SMPayload {
  const rolesValue = settings.trackedRoleIds.length
    ? settings.trackedRoleIds.map(id => `<@&${id}>`).join(' ')
    : '_None configured — no members will appear in the staff list_';

  const embed = new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle('⚙️ Staff Management Settings')
    .addFields(
      { name: '🛡️ Tracked Roles', value: rolesValue, inline: false },
      { name: '😴 Inactive Threshold', value: `${settings.inactiveThresholdDays} day(s)`, inline: true },
    )
    .setFooter({ text: 'Only members with a tracked role appear in the Staff List and reports' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🛡️ Set Tracked Roles', SM.SETTINGS_ROLES, ButtonStyle.Primary),
    btn('😴 Set Inactive Threshold', SM.SETTINGS_INACTIVE, ButtonStyle.Secondary),
    btn('💎 Point Values', SM.POINTS, ButtonStyle.Secondary),
  );
  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId(SM.SETTINGS_ROLES_SEL)
      .setPlaceholder('🛡️ Select tracked staff roles (up to 10)...').setMinValues(0).setMaxValues(10),
  );

  return { content: '', embeds: [embed], components: [row1, roleRow, nav()] };
}

export function buildInactiveThresholdModal(current: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SM.SETTINGS_INACTIVE_M)
    .setTitle('Set Inactive Threshold')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('days').setLabel('Days of inactivity before flagged')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setValue(String(current)),
      ),
    );
}

export function buildReportChannelSelectRow(): ActionRowBuilder<ChannelSelectMenuBuilder> {
  return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(SM.REPORTS_CHANNEL_SEL)
      .setPlaceholder('📬 Select the report channel...')
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );
}

// ── Point Values ─────────────────────────────────────────────────────────────

export function buildPointsPage(values: Record<StaffActionType, number>): SMPayload {
  const lines = ALL_STAFF_ACTIONS.map(a => `${STAFF_ACTION_LABELS[a]}: **${values[a]}** pts`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle('💎 Staff Point Values')
    .setDescription(lines)
    .setFooter({ text: 'Select an action below to change its point value' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(SM.POINTS_SELECT)
    .setPlaceholder('✏️ Select an action to edit...')
    .addOptions(ALL_STAFF_ACTIONS.map(a => ({
      label: STAFF_ACTION_LABELS[a].replace(/^\S+\s/, '').slice(0, 100),
      value: a,
      description: `Currently ${values[a]} pts`,
    })));

  return {
    content: '', embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), nav()],
  };
}

export function buildPointsModal(action: StaffActionType, current: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SM.pointsModal(action))
    .setTitle(`Set Points — ${STAFF_ACTION_LABELS[action]}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('points').setLabel('Point value (can be negative)')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setValue(String(current)),
      ),
    );
}
