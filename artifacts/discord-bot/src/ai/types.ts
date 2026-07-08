import type { Guild, GuildMember } from 'discord.js';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type ChatCompletionMessageToolCall = ToolCall;

export type ConversationMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ExecutionPlan {
  prompt: string;
  toolCalls: ToolCall[];
}

export type PlannerResponse =
  | { kind: 'tool_calls'; toolCalls: ToolCall[] }
  | { kind: 'text'; content: string };

export interface AIContext {
  guild: Guild;
  member: GuildMember;
  channelId: string;
  userId: string;
  prompt: string;
}

export interface ExecutionLog {
  userId: string;
  username: string;
  prompt: string;
  toolsExecuted: ToolResult[];
  success: boolean;
  durationMs: number;
  timestamp: Date;
}
