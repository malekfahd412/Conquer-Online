import type { ConversationMessage, PlannerResponse } from './types';
import type { ToolRegistry } from './tool-registry';
import type { IAIProvider } from './providers/ai-provider.interface';
import { createAIProvider } from './providers/provider.factory';

export class Planner {
  private readonly provider: IAIProvider;

  constructor(private readonly toolRegistry: ToolRegistry) {
    this.provider = createAIProvider();
  }

  async plan(messages: ConversationMessage[]): Promise<PlannerResponse> {
    const tools = this.toolRegistry.getToolDefinitions();
    return this.provider.generate(messages, tools);
  }

  /** Generate a response without any tools (for reflection / summaries). */
  async reflect(messages: ConversationMessage[]): Promise<string> {
    const response = await this.provider.generate(messages, []);
    return response.kind === 'text' ? response.content : '';
  }

  get modelName(): string {
    return this.provider.modelName;
  }
}
