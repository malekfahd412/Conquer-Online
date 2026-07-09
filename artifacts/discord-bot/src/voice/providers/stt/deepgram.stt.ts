import type { ISpeechRecognizer } from '../../SpeechRecognizer';
import { logger } from '../../../utils/logger';

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
  error?: string;
}

export class DeepgramSTT implements ISpeechRecognizer {
  readonly providerName = 'Deepgram';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly language: string;

  constructor() {
    this.apiKey = process.env['DEEPGRAM_API_KEY'] ?? '';
    this.model = process.env['STT_MODEL'] ?? 'nova-2';
    this.language = process.env['VOICE_LANGUAGE'] ?? 'en';
  }

  async recognize(wavBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      logger.warning('[STT/Deepgram] DEEPGRAM_API_KEY is not set');
      return '';
    }
    if (wavBuffer.length < 1024) return '';

    const params = new URLSearchParams({
      model: this.model,
      language: this.language,
      smart_format: 'true',
      punctuate: 'true',
    });

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: wavBuffer,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[STT/Deepgram] API error ${res.status}: ${err}`);
      return '';
    }

    const data = await res.json() as DeepgramResponse;

    if (data.error) {
      logger.error(`[STT/Deepgram] Error: ${data.error}`);
      return '';
    }

    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  }

  static isConfigured(): boolean {
    return Boolean(process.env['DEEPGRAM_API_KEY']);
  }
}
