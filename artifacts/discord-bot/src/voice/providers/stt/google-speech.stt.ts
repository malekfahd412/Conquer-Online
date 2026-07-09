import type { ISpeechRecognizer } from '../../SpeechRecognizer';
import { logger } from '../../../utils/logger';

interface GoogleSpeechResponse {
  results?: Array<{
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  }>;
  error?: { message: string };
}

export class GoogleSpeechSTT implements ISpeechRecognizer {
  readonly providerName = 'Google Speech';
  private readonly apiKey: string;
  private readonly language: string;

  constructor() {
    this.apiKey = process.env['GOOGLE_API_KEY'] ?? '';
    this.language = process.env['VOICE_LANGUAGE'] ?? 'en-US';
  }

  async recognize(wavBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      logger.warning('[STT/Google] GOOGLE_API_KEY is not set');
      return '';
    }
    if (wavBuffer.length < 1024) return '';

    // Google Speech REST API expects base64-encoded audio (raw PCM or WAV)
    const audioContent = wavBuffer.toString('base64');

    const body = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        audioChannelCount: 2,
        languageCode: this.language,
        enableAutomaticPunctuation: true,
      },
      audio: { content: audioContent },
    };

    const res = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[STT/Google] API error ${res.status}: ${err}`);
      return '';
    }

    const data = await res.json() as GoogleSpeechResponse;
    if (data.error) {
      logger.error(`[STT/Google] Error: ${data.error.message}`);
      return '';
    }

    return data.results?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  }

  static isConfigured(): boolean {
    return Boolean(process.env['GOOGLE_API_KEY']);
  }
}
