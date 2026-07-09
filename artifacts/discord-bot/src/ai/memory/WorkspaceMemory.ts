import { randomUUID } from 'node:crypto';
import type { ConversationMessage } from '../types';
import type { Workspace, CurrentContext, CreatedObject, ExecutedAction, TaskStep } from './types';
import { MemoryStorage } from './MemoryStorage';
import { logger } from '../../utils/logger';

const STORAGE_KEY = 'workspaces';

export class WorkspaceMemory {
  private workspaces = new Map<string, Workspace>();
  private readonly storage: MemoryStorage;
  private dirty = false;

  constructor() {
    this.storage = new MemoryStorage();
  }

  async initialize(): Promise<void> {
    const data = await this.storage.load<Record<string, Workspace>>(STORAGE_KEY);
    if (data) {
      for (const [id, ws] of Object.entries(data)) {
        this.workspaces.set(id, ws);
      }
      logger.info(`Loaded ${this.workspaces.size} workspace(s) from storage`);
    }
    // Persist every 5 minutes
    setInterval(() => this.flush().catch(() => {}), 5 * 60_000);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  create(name: string, userId: string, guildId: string, description?: string): Workspace {
    const id = randomUUID();
    const emptyContext: CurrentContext = {
      mentionedMembers: [],
      mentionedChannels: [],
      mentionedRoles: [],
    };

    const ws: Workspace = {
      id,
      name,
      description,
      guildId,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messages: [],
      objects: [],
      actions: [],
      context: emptyContext,
      task: null,
      taskSteps: [],
    };

    this.workspaces.set(id, ws);
    this.dirty = true;
    logger.info(`Created workspace "${name}" (${id}) for user ${userId}`);
    return ws;
  }

  get(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  listForUser(userId: string, guildId: string): Workspace[] {
    return Array.from(this.workspaces.values())
      .filter(ws => ws.userId === userId && ws.guildId === guildId)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }

  findByName(userId: string, guildId: string, name: string): Workspace | undefined {
    const lower = name.toLowerCase();
    return Array.from(this.workspaces.values()).find(
      ws =>
        ws.userId === userId &&
        ws.guildId === guildId &&
        ws.name.toLowerCase() === lower,
    );
  }

  delete(id: string): boolean {
    const existed = this.workspaces.has(id);
    this.workspaces.delete(id);
    if (existed) this.dirty = true;
    return existed;
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  addMessage(id: string, msg: ConversationMessage): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    ws.messages.push(msg);
    ws.lastActivity = Date.now();
    this.dirty = true;
  }

  getMessages(id: string): ConversationMessage[] {
    return this.workspaces.get(id)?.messages ?? [];
  }

  clearMessages(id: string): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    ws.messages = [];
    ws.objects = [];
    ws.actions = [];
    ws.context = { mentionedMembers: [], mentionedChannels: [], mentionedRoles: [] };
    ws.task = null;
    ws.taskSteps = [];
    this.dirty = true;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  registerObject(id: string, obj: CreatedObject): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    ws.objects.push(obj);
    this.dirty = true;
  }

  recordAction(id: string, action: ExecutedAction): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    ws.actions.push(action);
    this.dirty = true;
  }

  updateContext(id: string, partial: Partial<CurrentContext>): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    ws.context = { ...ws.context, ...partial };
    this.dirty = true;
  }

  setTask(id: string, task: string, steps: TaskStep[] = []): void {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    ws.task = task;
    ws.taskSteps = steps;
    this.dirty = true;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (!this.dirty) return;
    const data: Record<string, Workspace> = {};
    for (const [id, ws] of this.workspaces) {
      // Limit stored messages to last 100 per workspace
      data[id] = { ...ws, messages: ws.messages.slice(-100) };
    }
    await this.storage.save(STORAGE_KEY, data);
    this.dirty = false;
  }
}
