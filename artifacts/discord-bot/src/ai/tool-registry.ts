import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ITool } from './tools/tool.interface';
import { ALL_TOOLS } from './tools/index';
import { logger } from '../utils/logger';

export class ToolRegistry {
  private readonly tools = new Map<string, ITool>();

  constructor() {
    for (const ToolClass of ALL_TOOLS) {
      const instance = new ToolClass();
      this.tools.set(instance.definition.name, instance);
    }
    logger.info(`Tool registry loaded ${this.tools.size} tools`);
  }

  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  isDangerous(name: string): boolean {
    return this.tools.get(name)?.definition.dangerous ?? false;
  }

  getDangerDescription(name: string): string {
    return this.tools.get(name)?.definition.dangerDescription ?? 'This action cannot be undone.';
  }

  getToolDefinitions(): ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
    }));
  }
}
