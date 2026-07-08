import type { Guild } from 'discord.js';

export interface ToolExecuteResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ToolParameterSchema {
  type: string;
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
  dangerous: boolean;
  dangerDescription?: string;
}

export interface ITool {
  readonly definition: ToolDefinition;
  execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult>;
}
