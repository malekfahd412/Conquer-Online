import type { ConversationMessage, PlannerResponse } from '../types';
import type { ToolDefinition } from '../tools/tool.interface';

export interface IAIProvider {
  generate(messages: ConversationMessage[], tools: ToolDefinition[]): Promise<PlannerResponse>;
  readonly modelName: string;
}
