import type { Content, FunctionCall, FunctionDeclaration, Part, Schema } from '@google/genai';
import type { ConversationMessage, ToolCall, PlannerResponse } from './types';
import type { ToolRegistry } from './tool-registry';
import { getGeminiClient, AI_MODEL } from './gemini-client';
import { logger } from '../utils/logger';

const MISSING_KEY_RESPONSE = 'Gemini API is not configured.';

export class Planner {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async plan(messages: ConversationMessage[]): Promise<PlannerResponse> {
    const client = getGeminiClient();
    if (!client) {
      return { kind: 'text', content: MISSING_KEY_RESPONSE };
    }

    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system') as Exclude<ConversationMessage, { role: 'system' }>[];

    const contents = this.toGeminiContents(nonSystemMessages);
    const functionDeclarations = this.getFunctionDeclarations();

    logger.info(`Calling Gemini (${AI_MODEL}) with ${contents.length} content(s) and ${functionDeclarations.length} tools...`);

    const response = await client.models.generateContent({
      model: AI_MODEL,
      contents,
      config: {
        ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
        tools: [{ functionDeclarations }],
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const toolCalls: ToolCall[] = functionCalls
        .filter((fc: FunctionCall): fc is FunctionCall & { name: string } => typeof fc.name === 'string')
        .map((fc: FunctionCall & { name: string }, i: number) => ({
          id: `call_${i}_${Date.now()}_${fc.name}`,
          type: 'function' as const,
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args ?? {}),
          },
        }));
      logger.info(`AI selected ${toolCalls.length} tool(s): ${toolCalls.map(t => t.function.name).join(', ')}`);
      return { kind: 'tool_calls', toolCalls };
    }

    const text = response.text ?? 'I was unable to process your request. Please try again.';
    return { kind: 'text', content: text };
  }

  private toGeminiContents(
    messages: Exclude<ConversationMessage, { role: 'system' }>[],
  ): Content[] {
    const contents: Content[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });

      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const parts: Part[] = msg.tool_calls.map(tc => ({
            functionCall: {
              name: tc.function.name,
              args: this.safeParseArgs(tc.function.arguments),
            },
          }));
          contents.push({ role: 'model', parts });
        } else if (msg.content) {
          contents.push({ role: 'model', parts: [{ text: msg.content }] });
        }

      } else if (msg.role === 'tool') {
        const toolName = this.findToolName(messages.slice(0, i), msg.tool_call_id);
        const parts: Part[] = [{
          functionResponse: {
            name: toolName,
            response: { content: msg.content },
          },
        }];
        contents.push({ role: 'user', parts });
      }
    }

    return contents;
  }

  private findToolName(
    messages: Exclude<ConversationMessage, { role: 'system' }>[],
    toolCallId: string,
  ): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.tool_calls) {
        const tc = msg.tool_calls.find(t => t.id === toolCallId);
        if (tc) return tc.function.name;
      }
    }
    logger.warning(`Could not find tool name for call ID: ${toolCallId}`);
    return 'unknown';
  }

  private safeParseArgs(argsJson: string): Record<string, unknown> {
    try {
      return JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private getFunctionDeclarations(): FunctionDeclaration[] {
    return this.toolRegistry.getToolDefinitions().map(def => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters as unknown as Schema,
    }));
  }
}
