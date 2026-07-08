import type { Guild } from 'discord.js';
import type { ToolCall, ToolResult } from './types';
import type { ToolRegistry } from './tool-registry';
import { logger } from '../utils/logger';

export class Executor {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async execute(toolCalls: ToolCall[], guild: Guild): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const tool = this.toolRegistry.getTool(toolCall.function.name);

      if (!tool) {
        logger.warning(`Unknown tool requested: ${toolCall.function.name}`);
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          success: false,
          message: `Unknown tool: ${toolCall.function.name}`,
        });
        continue;
      }

      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          success: false,
          message: 'Invalid tool arguments from AI',
        });
        continue;
      }

      try {
        logger.info(`Executing tool: ${toolCall.function.name} with params: ${JSON.stringify(params)}`);
        const result = await tool.execute(params, guild);
        logger.info(`Tool ${toolCall.function.name}: ${result.success ? '✅' : '❌'} ${result.message}`);
        results.push({ toolCallId: toolCall.id, toolName: toolCall.function.name, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error during execution';
        logger.error(`Tool ${toolCall.function.name} threw an error`, error);
        results.push({ toolCallId: toolCall.id, toolName: toolCall.function.name, success: false, message });
      }
    }

    return results;
  }
}
