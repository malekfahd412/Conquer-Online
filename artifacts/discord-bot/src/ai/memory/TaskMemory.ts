import type { TaskStep } from './types';

export class TaskMemory {
  private taskName: string | null = null;
  private steps: TaskStep[] = [];

  setTask(name: string, steps: string[] = []): void {
    this.taskName = name;
    this.steps = steps.map(d => ({ description: d, completed: false }));
  }

  clear(): void {
    this.taskName = null;
    this.steps = [];
  }

  completeStep(index: number): void {
    const step = this.steps[index];
    if (step) step.completed = true;
  }

  completeNextStep(): void {
    const next = this.steps.findIndex(s => !s.completed);
    if (next !== -1) this.steps[next].completed = true;
  }

  getTask(): string | null { return this.taskName; }
  getSteps(): TaskStep[] { return [...this.steps]; }

  buildPromptText(): string {
    if (!this.taskName) return '';
    const lines = [`Current Task: ${this.taskName}`];
    const done = this.steps.filter(s => s.completed);
    const pending = this.steps.filter(s => !s.completed);
    if (done.length) lines.push(`Completed:\n${done.map(s => `  ✓ ${s.description}`).join('\n')}`);
    if (pending.length) lines.push(`Remaining:\n${pending.map(s => `  • ${s.description}`).join('\n')}`);
    return lines.join('\n');
  }
}
