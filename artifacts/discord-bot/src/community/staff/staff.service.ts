// ─────────────────────────────────────────────────────────────────────────────
// StaffService — the only subscriber of `staffEventBus`. Aggregates raw
// action events into profiles, points, timeline entries, and goal progress.
// Nothing else in the codebase should write to staff.json / staff-points.json
// / staff-goals.json directly outside of this file and the dashboard service
// (which calls back into this same API for settings/points/goals CRUD).
// ─────────────────────────────────────────────────────────────────────────────
import type { StaffActionEvent } from './staff-events';
import { staffEventBus } from './staff-events';
import type { StaffActionType, StaffGoal, LeaderboardPeriod } from './types';
import { STAFF_ACTION_LABELS, ALL_STAFF_ACTIONS } from './types';
import * as staffStore from './staff-store';
import * as pointsStore from './staff-points-store';
import * as goalsStore from './staff-goals-store';
import { logger } from '../../utils/logger';

function describe(evt: StaffActionEvent): string {
  const label = STAFF_ACTION_LABELS[evt.action];
  return evt.detail ? `${label} — ${evt.detail}` : label;
}

class StaffService {
  private initialized = false;

  /** Wires the event bus listener exactly once. Safe to call multiple times. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    staffEventBus.onAction(evt => {
      this.recordAction(evt).catch(err => logger.error('[Staff] Failed to record staff action', err));
    });
    logger.info('[Staff] Staff Management Pro event listener attached');
  }

  private async recordAction(evt: StaffActionEvent): Promise<void> {
    const { guildId, userId, action } = evt;

    await staffStore.mutateProfile(guildId, userId, profile => {
      profile.counts[action] = (profile.counts[action] ?? 0) + 1;
      profile.lastActivityAt = evt.timestamp ?? Date.now();
      if (profile.status === 'inactive') profile.status = 'active';
      if (evt.firstResponseMs !== undefined) {
        profile.firstResponseTotalMs += evt.firstResponseMs;
        profile.firstResponseSamples += 1;
      }
      if (evt.resolutionMs !== undefined) {
        profile.resolutionTotalMs += evt.resolutionMs;
        profile.resolutionSamples += 1;
      }
      profile.timeline.unshift({
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        action,
        description: describe(evt),
        timestamp: evt.timestamp ?? Date.now(),
      });
      if (profile.timeline.length > 200) profile.timeline.length = 200;
    });

    await pointsStore.awardPoints(guildId, userId, action);
    await this.checkGoalCompletion(guildId, action);
  }

  private async checkGoalCompletion(guildId: string, action: StaffActionType): Promise<void> {
    const goals = await goalsStore.listGoals(guildId);
    const relevant = goals.filter(g => !g.completedAt && g.metric === action);
    for (const goal of relevant) {
      const progress = await this.computeGoalProgress(goal);
      if (progress >= goal.target) {
        await goalsStore.markGoalCompleted(guildId, goal.id);
      }
    }
  }

  // ── Goal progress ──────────────────────────────────────────────────────────

  private goalWindowStart(goal: StaffGoal, now: number): number {
    if (goal.period === 'alltime') return goal.createdAt;
    const periodStart = pointsStore.periodStart(goal.period, now);
    return Math.max(periodStart, goal.createdAt);
  }

  async computeGoalProgress(goal: StaffGoal): Promise<number> {
    const windowStart = this.goalWindowStart(goal, Date.now());
    if (goal.metric === 'points') {
      const txs = await pointsStore.getTransactions(goal.guildId, windowStart);
      return txs.reduce((sum, t) => sum + t.points, 0);
    }
    if (goal.metric === 'shift_hours') {
      const sessions = await staffStore.getShiftLog(goal.guildId, windowStart);
      return sessions.reduce((sum, s) => sum + s.durationMs, 0) / 3_600_000;
    }
    const txs = await pointsStore.getTransactions(goal.guildId, windowStart);
    return txs.filter(t => t.action === goal.metric).length;
  }

  // ── Profiles / settings passthroughs (used by the dashboard + /shift) ───────

  getProfile = staffStore.getProfile;
  listProfiles = staffStore.listProfiles;
  getGuildData = staffStore.getGuildStaffData;
  updateSettings = staffStore.updateStaffSettings;
  addWarning = staffStore.addWarning;
  addNote = staffStore.addNote;
  removeNote = staffStore.removeNote;
  setStatus = staffStore.setStatus;
  startShift = staffStore.startShift;
  endShift = staffStore.endShift;
  getShiftLog = staffStore.getShiftLog;

  getPointValues = pointsStore.getPointValues;
  setPointValue = pointsStore.setPointValue;
  getLeaderboard = (guildId: string, period: LeaderboardPeriod) => pointsStore.getLeaderboard(guildId, period);
  getUserTotalPoints = pointsStore.getUserTotalPoints;

  listGoals = goalsStore.listGoals;
  createGoal = goalsStore.createGoal;
  deleteGoal = goalsStore.deleteGoal;

  /** Staff considered inactive: no tracked activity within the guild's configured threshold. */
  async getInactiveStaff(guildId: string): Promise<{ userId: string; daysSinceActive: number }[]> {
    const settings = (await staffStore.getGuildStaffData(guildId)).settings;
    const thresholdMs = settings.inactiveThresholdDays * 86_400_000;
    const now = Date.now();
    const profiles = await staffStore.listProfiles(guildId);
    return profiles
      .filter(p => now - p.lastActivityAt > thresholdMs)
      .map(p => ({ userId: p.userId, daysSinceActive: Math.floor((now - p.lastActivityAt) / 86_400_000) }));
  }

  allActions(): StaffActionType[] {
    return ALL_STAFF_ACTIONS;
  }
}

export const staffService = new StaffService();
