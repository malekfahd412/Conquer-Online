import OpenAI from 'openai';
import { logger } from '../utils/logger';

function createOpenAIClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  const baseURL = process.env['AI_INTEGRATIONS_OPENAI_BASE_URL'];
  const integrationKey = process.env['AI_INTEGRATIONS_OPENAI_API_KEY'];

  const resolvedKey = integrationKey ?? apiKey;

  if (!resolvedKey) {
    logger.error('No OpenAI API key found. Set OPENAI_API_KEY in your environment.');
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey: resolvedKey,
    ...(baseURL ? { baseURL } : {}),
  });

  logger.success('OpenAI client initialized');
  return client;
}

export const openai = createOpenAIClient();
export const AI_MODEL = process.env['AI_MODEL'] ?? 'gpt-4o';
