import type { ISpeechSynthesizer } from '../../SpeechSynthesizer';
import { logger } from '../../../utils/logger';

interface ElevenLabsVoicesResponse {
  voices: Array<{ voice_id: string; name: string }>;
}

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel

export class ElevenLabsTTS implements ISpeechSynthesizer {
  readonly providerName = 'ElevenLabs';
  readonly audioFormat = 'mp3' as const;

  private readonly apiKey: string;
  private readonly modelId: string;
  private voiceId: string;
  private voiceIdResolved = false;

  constructor() {
    this.apiKey = process.env['ELEVENLABS_API_KEY'] ?? '';
    this.modelId = 'eleven_monolingual_v1';
    this.voiceId = DEFAULT_VOICE_ID;
  }

  /** Resolve voice name to ID on first use. */
  private async resolveVoiceId(): Promise<void> {
    if (this.voiceIdResolved) return;
    this.voiceIdResolved = true;

    const voiceName = process.env['VOICE_NAME'];
    if (!voiceName || !this.apiKey) return;

    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey },
      });
      if (!res.ok) return;

      const data = await res.json() as ElevenLabsVoicesResponse;
      const match = data.voices.find(v =>
        v.name.toLowerCase() === voiceName.toLowerCase(),
      );
      if (match) {
        this.voiceId = match.voice_id;
        logger.info(`[TTS/ElevenLabs] Using voice "${match.name}" (${match.voice_id})`);
      }
    } catch { /* fallback to default */ }
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      logger.warning('[TTS/ElevenLabs] ELEVENLABS_API_KEY is not set');
      return Buffer.alloc(0);
    }

    const trimmed = text.trim().slice(0, 5000);
    if (!trimmed) return Buffer.alloc(0);

    await this.resolveVoiceId();

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: this.modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      logger.error(`[TTS/ElevenLabs] API error ${res.status}: ${err}`);
      return Buffer.alloc(0);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  static isConfigured(): boolean {
    return Boolean(process.env['ELEVENLABS_API_KEY']);
  }
}
