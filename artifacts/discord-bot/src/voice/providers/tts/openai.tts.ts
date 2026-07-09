import type { ISpeechSynthesizer } from '../../SpeechSynthesizer';
import { logger } from '../../../utils/logger';

type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export class OpenAITTS implements ISpeechSynthesizer {
  readonly providerName = 'OpenAI TTS';
  readonly audioFormat = 'mp3' as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly voice: OpenAIVoice;

  constructor() {
    this.apiKey = process.env['OPENAI_API_KEY'] ?? '';
    this.model = 'tts-1';
    const voiceName = (process.env['VOICE_NAME'] ?? 'onyx').toLowerCase();
    const validVoices: OpenAIVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    this.voice = validVoices.includes(voiceName as OpenAIVoice)
      ? (voiceName as OpenAIVoice)
      : 'onyx';
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      logger.warning('[TTS/OpenAI] OPENAI_API_KEY is not set');
      return Buffer.alloc(0);
    }

    const trimmed = text.trim().slice(0, 4096);
    if (!trimmed) return Buffer.alloc(0);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: trimmed,
        voice: this.voice,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[TTS/OpenAI] API error ${res.status}: ${err}`);
      return Buffer.alloc(0);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  static isConfigured(): boolean {
    return Boolean(process.env['OPENAI_API_KEY']);
  }
}
