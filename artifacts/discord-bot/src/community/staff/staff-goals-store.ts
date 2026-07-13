import { promises as fs } from 'fs';
import path from 'path';
import type { StaffGoal, GoalMetric, GoalPeriod } from './types';
import { genId } from './staff-store';

const DATA_PATH = path.join(process.cwd(), 'data', 'staff-goals.json');

interface FileData {
  guilds: Record<string, StaffGoal[]>;
}

async function load(): Promise<FileData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null) {
      return (parsed as unknown) as FileData;
    }
  } catch { /* first run */ }
  return { guilds: {} };
}

async function save(data: FileData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function listGoals(guildId: string): Promise<StaffGoal[]> {
  const data = await load();
  return data.guilds[guildId] ?? [];
}

export async function createGoal(
  guildId: string,
  label: string,
  metric: GoalMetric,
  target: number,
  period: GoalPeriod,
  createdBy: string,
): Promise<StaffGoal> {
  const data = await load();
  const goal: StaffGoal = { id: genId(), guildId, label, metric, target, period, createdAt: Date.now(), createdBy };
  data.guilds[guildId] = [...(data.guilds[guildId] ?? []), goal];
  await save(data);
  return goal;
}

export async function deleteGoal(guildId: string, goalId: string): Promise<boolean> {
  const data = await load();
  const goals = data.guilds[guildId];
  if (!goals) return false;
  const before = goals.length;
  data.guilds[guildId] = goals.filter(g => g.id !== goalId);
  if (data.guilds[guildId].length === before) return false;
  await save(data);
  return true;
}

export async function markGoalCompleted(guildId: string, goalId: string): Promise<void> {
  const data = await load();
  const goals = data.guilds[guildId];
  if (!goals) return;
  const goal = goals.find(g => g.id === goalId);
  if (goal && !goal.completedAt) {
    goal.completedAt = Date.now();
    await save(data);
  }
}
