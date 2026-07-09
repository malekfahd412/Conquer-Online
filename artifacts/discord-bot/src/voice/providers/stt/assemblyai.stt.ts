import type { ISpeechRecognizer } from '../../SpeechRecognizer';
import { logger } from '../../../utils/logger';

interface UploadResponse { upload_url: string }
interface TranscriptResponse { id?: string; status?: string; text?: string; error?: string }

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;

export class AssemblyAISTT implements ISpeechRecognizer {
  readonly providerName = 'AssemblyAI';
  private readonly apiKey: string;
  private readonly language: string;

  constructor() {
    this.apiKey = process.env['ASSEMBLYAI_API_KEY'] ?? '';
    this.language = process.env['VOICE_LANGUAGE'] ?? 'en';
  }

  async recognize(wavBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      logger.warning('[STT/AssemblyAI] ASSEMBLYAI_API_KEY is not set');
      return '';
    }
    if (wavBuffer.length < 1024) return '';

    const headers = { Authorization: this.apiKey, 'Content-Type': 'application/octet-stream' };

    // 1. Upload audio
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers,
      body: wavBuffer,
    });

    if (!uploadRes.ok) {
      logger.error(`[STT/AssemblyAI] Upload error ${uploadRes.status}`);
      return '';
    }

    const { upload_url } = await uploadRes.json() as UploadResponse;

    // 2. Request transcription
    const body: Record<string, unknown> = { audio_url: upload_url };
    if (this.language !== 'en') body['language_code'] = this.language;

    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { Authorization: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!transcriptRes.ok) {
      logger.error(`[STT/AssemblyAI] Transcript request error ${transcriptRes.status}`);
      return '';
    }

    const { id } = await transcriptRes.json() as TranscriptResponse;
    if (!id) return '';

    // 3. Poll for result
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { Authorization: this.apiKey },
      });

      if (!pollRes.ok) continue;

      const data = await pollRes.json() as TranscriptResponse;
      if (data.status === 'completed') return data.text?.trim() ?? '';
      if (data.status === 'error') {
        logger.error(`[STT/AssemblyAI] Transcription error: ${data.error ?? 'unknown'}`);
        return '';
      }
    }

    logger.warning('[STT/AssemblyAI] Transcription timed out');
    return '';
  }

  static isConfigured(): boolean {
    return Boolean(process.env['ASSEMBLYAI_API_KEY']);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
