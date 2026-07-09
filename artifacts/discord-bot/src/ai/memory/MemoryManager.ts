import type { ConversationMessage, ToolCall, ToolResult } from '../types';
import type { CreatedObject, ExecutedAction, MemoryContext, MemoryDisplay, Workspace } from './types';
import { ConversationMemory } from './ConversationMemory';
import { LongTermMemory } from './LongTermMemory';
import { MemoryStorage } from './MemoryStorage';
import { ReferenceResolver } from './ReferenceResolver';
import { logger } from '../../utils/logger';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const DEBUG = process.env['DEBUG_MEMORY'] === 'true';

type ContextKey = 'category' | 'channel' | 'role';

const CREATES_OBJECT: Record<string, CreatedObject['type']> = {
  create_category: 'category',
  create_channel: 'channel',
  clone_channel: 'channel',
  create_forum_channel: 'channel',
  create_role: 'role',
  create_embed: 'embed',
  create_thread: 'thread',
  create_scheduled_event: 'event',
  create_webhook: 'webhook',
  create_invite: 'invite',
};

const RENAMES: Record<string, ContextKey> = {
  rename_category: 'category',
  rename_channel: 'channel',
  rename_role: 'role',
};

export class MemoryManager {
  private readonly sessions = new Map<string, ConversationMemory>();
  private readonly workspaceIds = new Map<string, string | undefined>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ltm: LongTermMemory;

  constructor() {
    const storage = new MemoryStorage();
    this.ltm = new LongTermMemory(storage);
  }

  async initialize(): Promise<void> {
    await this.ltm.load();
    this.startCleanup();
  }

  private key(userId: string, guildId: string): string {
    return `${userId}:${guildId}`;
  }

  getMemory(userId: string, guildId: string): ConversationMemory {
    const k = this.key(userId, guildId);
    let mem = this.sessions.get(k);
    if (!mem || mem.isExpired()) {
      if (mem) logger.info(`Memory expired for user ${userId} — fresh session started`);
      mem = new ConversationMemory(userId, guildId);
      this.sessions.set(k, mem);
    }
    return mem;
  }

  // ── Message Operations ────────────────────────────────────────────────────

  addUserMessage(userId: string, guildId: string, content: string): void {
    this.getMemory(userId, guildId).addMessage({ role: 'user', content });
  }

  addAssistantMessage(userId: string, guildId: string, msg: ConversationMessage): void {
    this.getMemory(userId, guildId).addMessage(msg);
  }

  addToolResult(userId: string, guildId: string, toolCallId: string, content: string): void {
    this.getMemory(userId, guildId).addMessage({ role: 'tool', tool_call_id: toolCallId, content });
  }

  /** Add a raw ConversationMessage (used when restoring workspace history). */
  addRawMessage(userId: string, guildId: string, msg: ConversationMessage): void {
    this.getMemory(userId, guildId).addMessage(msg);
  }

  getMessages(userId: string, guildId: string): ConversationMessage[] {
    return this.getMemory(userId, guildId).getMessages();
  }

  // ── Post-Execution Processing ─────────────────────────────────────────────

  processToolResults(
    userId: string,
    guildId: string,
    toolCalls: ToolCall[],
    results: ToolResult[],
  ): void {
    const mem = this.getMemory(userId, guildId);

    for (const result of results) {
      const tc = toolCalls.find(t => t.id === result.toolCallId);
      if (!tc) continue;

      let params: Record<string, unknown> = {};
      try { params = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* skip */ }

      const action: ExecutedAction = {
        id: result.toolCallId,
        toolName: result.toolName,
        toolCallId: result.toolCallId,
        params,
        resultMessage: result.message,
        success: result.success,
        timestamp: Date.now(),
      };
      mem.recordAction(action);
      if (!result.success) continue;

      const objType = CREATES_OBJECT[result.toolName];
      if (objType && typeof params['name'] === 'string') {
        const obj: CreatedObject = {
          type: objType,
          id: '',
          name: params['name'],
          parentName: typeof params['categoryName'] === 'string' ? params['categoryName'] : undefined,
          createdAt: Date.now(),
        };
        mem.registerObject(obj);
        if (DEBUG) logger.info(`[MEMORY] Registered: ${obj.type} "${obj.name}"`);
      }

      const renameKey = RENAMES[result.toolName];
      if (renameKey && typeof params['newName'] === 'string') {
        const ctx = mem.getContext();
        const current = ctx[renameKey];
        if (current) {
          mem.updateContext({ [renameKey]: { ...current, name: params['newName'] as string } } as Parameters<typeof mem.updateContext>[0]);
          if (DEBUG) logger.info(`[MEMORY] Renamed ${renameKey} context → "${params['newName']}"`);
        }
      }
    }

    if (DEBUG) {
      const session = mem.getSession();
      logger.info(`[MEMORY] User ${userId} — msgs: ${session.messages.length}, objects: ${session.objects.length}, actions: ${session.actions.length}`);
    }
  }

  // ── Context for Prompt ────────────────────────────────────────────────────

  buildContextText(userId: string, guildId: string): string {
    const ctx = this.getContext(userId, guildId);
    return ReferenceResolver.buildContextText(ctx.session, ctx.preferences);
  }

  getContext(userId: string, guildId: string): MemoryContext {
    return {
      session: this.getMemory(userId, guildId).getSession(),
      preferences: this.ltm.get(userId),
    };
  }

  // ── Workspace ─────────────────────────────────────────────────────────────

  setWorkspace(userId: string, guildId: string, workspaceId: string | undefined): void {
    this.workspaceIds.set(this.key(userId, guildId), workspaceId);
    if (workspaceId) {
      this.getMemory(userId, guildId).setWorkspaceId(workspaceId);
    }
  }

  getWorkspaceId(userId: string, guildId: string): string | undefined {
    return this.workspaceIds.get(this.key(userId, guildId));
  }

  /** Restore structured state (objects, context, task) from a workspace into the active session. */
  restoreWorkspaceSession(userId: string, guildId: string, ws: Workspace): void {
    this.getMemory(userId, guildId).restoreState({
      objects: ws.objects,
      actions: ws.actions,
      context: ws.context,
      currentTask: ws.task,
      taskSteps: ws.taskSteps,
    });
  }

  // ── Display ───────────────────────────────────────────────────────────────

  getDisplay(userId: string, guildId: string): MemoryDisplay {
    const session = this.getMemory(userId, guildId).getSession();
    return {
      task: session.currentTask,
      taskSteps: session.taskSteps,
      context: session.context,
      objects: session.objects,
      messageCount: session.messages.length,
      lastActivity: session.lastActivity,
      hasSummary: !!session.summary,
      workspaceId: session.workspaceId,
    };
  }

  // ── Session Operations ────────────────────────────────────────────────────

  clearSession(userId: string, guildId: string): void {
    this.getMemory(userId, guildId).clear();
  }

  getLongTermMemory(): LongTermMemory {
    return this.ltm;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      let removed = 0;
      for (const [key, mem] of this.sessions) {
        if (mem.isExpired()) { this.sessions.delete(key); removed++; }
      }
      if (removed > 0) logger.info(`Memory: removed ${removed} expired session(s)`);
    }, CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
  }
}
