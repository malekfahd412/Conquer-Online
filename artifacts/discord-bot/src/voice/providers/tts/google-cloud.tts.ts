import type { ISpeechSynthesizer } from '../../SpeechSynthesizer';
import { logger } from '../../../utils/logger';

interface GoogleTTSResponse {
  audioContent?: string;
  error?: { message: string };
}

export class GoogleCloudTTS implements ISpeechSynthesizer {
  readonly providerName = 'Google Cloud TTS';
  readonly audioFormat = 'mp3' as const;

  private readonly apiKey: string;
  private readonly voiceName: string;
  private readonly language: string;

  constructor() {
    this.apiKey = process.env['GOOGLE_API_KEY'] ?? '';
    this.language = process.env['VOICE_LANGUAGE'] ?? 'en-US';
    this.voiceName = process.env['VOICE_NAME'] ?? 'en-US-Neural2-D';
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      logger.warning('[TTS/Google] GOOGLE_API_KEY is not set');
      return Buffer.alloc(0);
    }

    const trimmed = text.trim().slice(0, 5000);
    if (!trimmed) return Buffer.alloc(0);

    const body = {
      input: { text: trimmed },
      voice: { languageCode: this.language, name: this.voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
      },
    };

    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[TTS/Google] API error ${res.status}: ${err}`);
      return Buffer.alloc(0);
    }

    const data = await res.json() as GoogleTTSResponse;
    if (data.error) {
      logger.error(`[TTS/Google] Error: ${data.error.message}`);
      return Buffer.alloc(0);
    }

    if (!data.audioContent) return Buffer.alloc(0);
    return Buffer.from(data.audioContent, 'base64');
  }

  static isConfigured(): boolean {
    return Boolean(process.env['GOOGLE_API_KEY']);
  }
}
