import { GoogleGenAI } from '@google/genai';
import type { Content, FunctionCall, FunctionDeclaration, Part, Schema } from '@google/genai';
import type { IAIProvider } from './ai-provider.interface';
import type { ConversationMessage, PlannerResponse, ToolCall } from '../types';
import type { ToolDefinition } from '../tools/tool.interface';
import { logger } from '../../utils/logger';

let _client: GoogleGenAI | null = null;
let _initialized = false;

function getClient(): GoogleGenAI | null {
  if (_initialized) return _client;
  _initialized = true;
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    logger.warning('GEMINI_API_KEY is not set — Gemini provider will not function.');
    return null;
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export class GeminiProvider implements IAIProvider {
  readonly modelName: string;

  constructor() {
    this.modelName = process.env['AI_MODEL'] ?? 'gemini-2.5-flash';
  }

  async generate(messages: ConversationMessage[], tools: ToolDefinition[]): Promise<PlannerResponse> {
    const client = getClient();
    if (!client) {
      return { kind: 'text', content: 'AI provider is not configured. Please set GEMINI_API_KEY.' };
    }

    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system') as Exclude<ConversationMessage, { role: 'system' }>[];

    const functionDeclarations: FunctionDeclaration[] = tools.map(def => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters as unknown as Schema,
    }));

    logger.info(`[Gemini/${this.modelName}] ${nonSystem.length} message(s), ${functionDeclarations.length} tool(s)`);

    const response = await client.models.generateContent({
      model: this.modelName,
      contents: this.toContents(nonSystem),
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
      logger.info(`[Gemini] Planned ${toolCalls.length} tool(s): ${toolCalls.map(t => t.function.name).join(', ')}`);
      return { kind: 'tool_calls', toolCalls };
    }

    return { kind: 'text', content: response.text ?? 'Unable to process request.' };
  }

  private toContents(messages: Exclude<ConversationMessage, { role: 'system' }>[]): Content[] {
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
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: toolName, response: { content: msg.content } } }],
        });
      }
    }
    return contents;
  }

  private findToolName(messages: Exclude<ConversationMessage, { role: 'system' }>[], toolCallId: string): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.tool_calls) {
        const tc = msg.tool_calls.find(t => t.id === toolCallId);
        if (tc) return tc.function.name;
      }
    }
    return 'unknown';
  }

  private safeParseArgs(argsJson: string): Record<string, unknown> {
    try { return JSON.parse(argsJson) as Record<string, unknown>; } catch { return {}; }
  }
}
