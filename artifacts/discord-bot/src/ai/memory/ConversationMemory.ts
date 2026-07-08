import type { ConversationMessage } from '../types';
import type { CreatedObject, ExecutedAction, CurrentContext, ConversationSession, TaskStep } from './types';
import { ConversationSummary } from './ConversationSummary';

const MAX_MESSAGES = 30;
const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function emptyContext(): CurrentContext {
  return { mentionedMembers: [], mentionedChannels: [], mentionedRoles: [] };
}

export class ConversationMemory {
  private readonly session: ConversationSession;

  constructor(userId: string, guildId: string) {
    this.session = {
      userId,
      guildId,
      messages: [],
      lastActivity: Date.now(),
      currentTask: null,
      taskSteps: [],
      objects: [],
      actions: [],
      context: emptyContext(),
      summary: null,
    };
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  addMessage(msg: ConversationMessage): void {
    this.session.messages.push(msg);
    this.touch();

    const nonSystem = this.session.messages.filter(m => m.role !== 'system');
    if (nonSystem.length > MAX_MESSAGES) {
      const toRemove = nonSystem.length - MAX_MESSAGES;
      let dropped = 0;
      this.session.messages = this.session.messages.filter(m => {
        if (m.role !== 'system' && dropped < toRemove) { dropped++; return false; }
        return true;
      });
    }

    ConversationSummary.trimIfNeeded(this.session);
  }

  getMessages(): ConversationMessage[] {
    return [...this.session.messages];
  }

  // ── Task ──────────────────────────────────────────────────────────────────

  setTask(name: string, steps: string[] = []): void {
    this.session.currentTask = name;
    this.session.taskSteps = steps.map(d => ({ description: d, completed: false }));
  }

  completeStep(index: number): void {
    const step = this.session.taskSteps[index];
    if (step) step.completed = true;
  }

  getTaskSteps(): TaskStep[] {
    return [...this.session.taskSteps];
  }

  // ── Object Registry ───────────────────────────────────────────────────────

  registerObject(obj: CreatedObject): void {
    this.session.objects.push(obj);
    this.session.context.lastObject = obj;

    switch (obj.type) {
      case 'category':
        this.session.context.category = { id: obj.id || undefined, name: obj.name };
        break;
      case 'channel':
        this.session.context.channel = { id: obj.id || undefined, name: obj.name };
        break;
      case 'role':
        this.session.context.role = { id: obj.id || undefined, name: obj.name };
        break;
    }
  }

  getObjects(): CreatedObject[] {
    return [...this.session.objects];
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  recordAction(action: ExecutedAction): void {
    this.session.actions.push(action);
    if (this.session.actions.length > 50) this.session.actions.shift();
  }

  getLastAction(): ExecutedAction | null {
    return this.session.actions[this.session.actions.length - 1] ?? null;
  }

  getActions(): ExecutedAction[] {
    return [...this.session.actions];
  }

  // ── Context ───────────────────────────────────────────────────────────────

  updateContext(updates: Partial<CurrentContext>): void {
    this.session.context = { ...this.session.context, ...updates };
  }

  getContext(): CurrentContext {
    return { ...this.session.context };
  }

  // ── Expiry ────────────────────────────────────────────────────────────────

  isExpired(): boolean {
    return Date.now() - this.session.lastActivity > EXPIRY_MS;
  }

  touch(): void {
    this.session.lastActivity = Date.now();
  }

  // ── Session ───────────────────────────────────────────────────────────────

  getSession(): ConversationSession {
    return this.session;
  }

  clear(): void {
    this.session.messages = [];
    this.session.currentTask = null;
    this.session.taskSteps = [];
    this.session.objects = [];
    this.session.actions = [];
    this.session.context = emptyContext();
    this.session.summary = null;
    this.touch();
  }
}
