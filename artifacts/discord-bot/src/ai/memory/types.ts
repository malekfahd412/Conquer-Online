import type { ConversationMessage } from '../types';

export type ObjectType = 'channel' | 'category' | 'role' | 'embed' | 'message' | 'thread' | 'event' | 'webhook' | 'invite';

export interface CreatedObject {
  type: ObjectType;
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  createdAt: number;
}

export interface ExecutedAction {
  id: string;
  toolName: string;
  toolCallId: string;
  params: Record<string, unknown>;
  resultMessage: string;
  success: boolean;
  timestamp: number;
  rollbackData?: Record<string, unknown>;
}

export interface TaskStep {
  description: string;
  completed: boolean;
}

export interface CurrentContext {
  category?: { id?: string; name: string };
  channel?: { id?: string; name: string };
  role?: { id?: string; name: string };
  embed?: { messageId?: string; description: string };
  lastObject?: CreatedObject;
  mentionedMembers: string[];
  mentionedChannels: string[];
  mentionedRoles: string[];
}

export interface ConversationSession {
  userId: string;
  guildId: string;
  messages: ConversationMessage[];
  lastActivity: number;
  currentTask: string | null;
  taskSteps: TaskStep[];
  objects: CreatedObject[];
  actions: ExecutedAction[];
  context: CurrentContext;
  summary: string | null;
  workspaceId?: string;
}

export interface UserPreferences {
  embedColor?: number;
  language?: string;
  channelNaming?: string;
  roleNaming?: string;
  announcementStyle?: string;
  ticketLayout?: string;
  categoryStructure?: string;
  updatedAt: number;
}

export interface MemoryContext {
  session: ConversationSession;
  preferences: UserPreferences | null;
}

export interface MemoryDisplay {
  task: string | null;
  taskSteps: TaskStep[];
  context: CurrentContext;
  objects: CreatedObject[];
  messageCount: number;
  lastActivity: number;
  hasSummary: boolean;
  workspaceId?: string;
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  guildId: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  messages: ConversationMessage[];
  objects: CreatedObject[];
  actions: ExecutedAction[];
  context: CurrentContext;
  task: string | null;
  taskSteps: TaskStep[];
}
