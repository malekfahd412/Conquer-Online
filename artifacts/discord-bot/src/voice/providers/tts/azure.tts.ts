import type { ISpeechSynthesizer } from '../../SpeechSynthesizer';
import { logger } from '../../../utils/logger';

export class AzureTTS implements ISpeechSynthesizer {
  readonly providerName = 'Azure TTS';
  readonly audioFormat = 'mp3' as const;

  private readonly apiKey: string;
  private readonly region: string;
  private readonly voiceName: string;
  private readonly language: string;

  constructor() {
    this.apiKey = process.env['AZURE_SPEECH_KEY'] ?? '';
    this.region = process.env['AZURE_SPEECH_REGION'] ?? 'eastus';
    this.voiceName = process.env['VOICE_NAME'] ?? 'en-US-GuyNeural';
    this.language = process.env['VOICE_LANGUAGE'] ?? 'en-US';
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      logger.warning('[TTS/Azure] AZURE_SPEECH_KEY is not set');
      return Buffer.alloc(0);
    }
    if (!this.region) {
      logger.warning('[TTS/Azure] AZURE_SPEECH_REGION is not set');
      return Buffer.alloc(0);
    }

    const trimmed = text.trim().slice(0, 5000);
    if (!trimmed) return Buffer.alloc(0);

    const ssml = `<speak version="1.0" xml:lang="${this.language}">
  <voice name="${this.voiceName}">
    ${escapeXml(trimmed)}
  </voice>
</speak>`;

    const res = await fetch(
      `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'DiscordAIBot',
        },
        body: ssml,
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[TTS/Azure] API error ${res.status}: ${err}`);
      return Buffer.alloc(0);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  static isConfigured(): boolean {
    return Boolean(process.env['AZURE_SPEECH_KEY']) && Boolean(process.env['AZURE_SPEECH_REGION']);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
