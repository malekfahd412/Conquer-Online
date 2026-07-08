import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { PlannerResponse } from './types';
import type { ToolRegistry } from './tool-registry';
import { openai, AI_MODEL } from './openai-client';
import { logger } from '../utils/logger';

export class Planner {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async plan(messages: ChatCompletionMessageParam[]): Promise<PlannerResponse> {
    logger.info(`Calling OpenAI (${AI_MODEL}) with ${messages.length} messages...`);

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages,
      tools: this.toolRegistry.getToolDefinitions(),
      tool_choice: 'auto',
      max_completion_tokens: 4096,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error('OpenAI returned an empty response');

    const message = choice.message;

    if (choice.finish_reason === 'tool_calls' && message.tool_calls && message.tool_calls.length > 0) {
      logger.info(`AI selected ${message.tool_calls.length} tool(s): ${message.tool_calls.map(t => t.function.name).join(', ')}`);
      return { kind: 'tool_calls', toolCalls: message.tool_calls };
    }

    const content = message.content ?? 'I was unable to process your request. Please try again.';
    return { kind: 'text', content };
  }
}
