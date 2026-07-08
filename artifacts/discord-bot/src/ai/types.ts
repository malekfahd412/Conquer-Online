import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import type { Guild, GuildMember } from 'discord.js';

export type { ChatCompletionMessageToolCall };

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ExecutionPlan {
  prompt: string;
  toolCalls: ChatCompletionMessageToolCall[];
}

export type PlannerResponse =
  | { kind: 'tool_calls'; toolCalls: ChatCompletionMessageToolCall[] }
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
