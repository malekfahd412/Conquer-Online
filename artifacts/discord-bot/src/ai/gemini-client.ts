import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger';

let _client: GoogleGenAI | null = null;
let _initialized = false;

export function getGeminiClient(): GoogleGenAI | null {
  if (_initialized) return _client;
  _initialized = true;

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    logger.warning('GEMINI_API_KEY is not set — AI features will return an error instead of working.');
    return null;
  }

  _client = new GoogleGenAI({ apiKey });
  logger.success('Gemini client initialized');
  return _client;
}

export const AI_MODEL = process.env['AI_MODEL'] ?? 'gemini-2.5-flash';
