import type { IAIProvider } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import { logger } from '../../utils/logger';

type AIProviderName = 'gemini' | 'openai' | 'openrouter' | 'groq';

export function createAIProvider(): IAIProvider {
  const raw = (process.env['AI_PROVIDER'] ?? 'gemini').toLowerCase().trim();

  const validProviders: AIProviderName[] = ['gemini', 'openai', 'openrouter', 'groq'];
  const providerName: AIProviderName = validProviders.includes(raw as AIProviderName)
    ? (raw as AIProviderName)
    : 'gemini';

  if (raw && !validProviders.includes(raw as AIProviderName)) {
    logger.warning(`Unknown AI_PROVIDER "${raw}" — falling back to Gemini`);
  }

  switch (providerName) {
    case 'openai':
      logger.info('AI Provider: OpenAI');
      return new OpenAICompatibleProvider('openai');
    case 'openrouter':
      logger.info('AI Provider: OpenRouter');
      return new OpenAICompatibleProvider('openrouter');
    case 'groq':
      logger.info('AI Provider: Groq');
      return new OpenAICompatibleProvider('groq');
    case 'gemini':
    default:
      logger.info('AI Provider: Gemini');
      return new GeminiProvider();
  }
}
