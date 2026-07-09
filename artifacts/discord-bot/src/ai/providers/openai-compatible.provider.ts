import type { IAIProvider } from './ai-provider.interface';
import type { ConversationMessage, PlannerResponse, ToolCall } from '../types';
import type { ToolDefinition } from '../tools/tool.interface';
import { logger } from '../../utils/logger';

type ProviderName = 'openai' | 'openrouter' | 'groq';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  error?: { message: string };
}

const BASE_URLS: Record<ProviderName, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
};

const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
};

const ENV_KEYS: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
};

export class OpenAICompatibleProvider implements IAIProvider {
  readonly modelName: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly providerName: ProviderName;

  constructor(provider: ProviderName) {
    this.providerName = provider;
    this.baseUrl = BASE_URLS[provider];
    this.modelName = process.env['AI_MODEL'] ?? DEFAULT_MODELS[provider];

    const key = process.env[ENV_KEYS[provider]];
    if (!key) {
      logger.warning(`${ENV_KEYS[provider]} is not set — ${provider} provider will not function.`);
    }
    this.apiKey = key ?? '';
  }

  async generate(messages: ConversationMessage[], tools: ToolDefinition[]): Promise<PlannerResponse> {
    if (!this.apiKey) {
      return {
        kind: 'text',
        content: `AI provider "${this.providerName}" is not configured. Please set ${ENV_KEYS[this.providerName]}.`,
      };
    }

    const openAIMessages = this.toOpenAIMessages(messages);
    const openAITools = tools.map(def => ({
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    }));

    logger.info(`[${this.providerName}/${this.modelName}] ${openAIMessages.length} message(s), ${openAITools.length} tool(s)`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.providerName === 'openrouter') {
      headers['HTTP-Referer'] = 'https://replit.com';
      headers['X-Title'] = 'Discord AI Control Center';
    }

    const body = JSON.stringify({
      model: this.modelName,
      messages: openAIMessages,
      tools: openAITools.length > 0 ? openAITools : undefined,
      tool_choice: openAITools.length > 0 ? 'auto' : undefined,
    });

    const res = await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', headers, body });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      logger.error(`[${this.providerName}] API error ${res.status}: ${errText}`);
      return { kind: 'text', content: `AI provider error (${res.status}). Please try again.` };
    }

    const data = await res.json() as OpenAIResponse;

    if (data.error) {
      logger.error(`[${this.providerName}] Error: ${data.error.message}`);
      return { kind: 'text', content: `AI error: ${data.error.message}` };
    }

    const choice = data.choices[0];
    if (!choice) return { kind: 'text', content: 'No response from AI provider.' };

    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = msg.tool_calls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
      logger.info(`[${this.providerName}] Planned ${toolCalls.length} tool(s): ${toolCalls.map(t => t.function.name).join(', ')}`);
      return { kind: 'tool_calls', toolCalls };
    }

    return { kind: 'text', content: msg.content ?? 'Unable to process request.' };
  }

  private toOpenAIMessages(messages: ConversationMessage[]): OpenAIMessage[] {
    return messages.map(msg => {
      if (msg.role === 'system') return { role: 'system', content: msg.content };
      if (msg.role === 'user') return { role: 'user', content: msg.content };
      if (msg.role === 'tool') return { role: 'tool', content: msg.content, tool_call_id: msg.tool_call_id };
      // assistant
      return {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    });
  }
}
