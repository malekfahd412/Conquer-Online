import type { ISpeechRecognizer } from '../../SpeechRecognizer';
import { logger } from '../../../utils/logger';

export class WhisperSTT implements ISpeechRecognizer {
  readonly providerName = 'OpenAI Whisper';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly language: string;

  constructor() {
    this.apiKey = process.env['OPENAI_API_KEY'] ?? '';
    this.model = process.env['STT_MODEL'] ?? 'whisper-1';
    this.language = process.env['VOICE_LANGUAGE'] ?? 'en';
  }

  async recognize(wavBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      logger.warning('[STT/Whisper] OPENAI_API_KEY is not set');
      return '';
    }
    if (wavBuffer.length < 1024) return ''; // too short to be real speech

    const formData = new FormData();
    formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', this.model);
    formData.append('language', this.language);
    formData.append('response_format', 'text');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[STT/Whisper] API error ${res.status}: ${err}`);
      return '';
    }

    const text = (await res.text()).trim();
    return text;
  }

  static isConfigured(): boolean {
    return Boolean(process.env['OPENAI_API_KEY']);
  }
}
