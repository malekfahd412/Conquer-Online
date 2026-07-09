import { OpenAITTS } from './providers/tts/openai.tts';
import { ElevenLabsTTS } from './providers/tts/elevenlabs.tts';
import { AzureTTS } from './providers/tts/azure.tts';
import { GoogleCloudTTS } from './providers/tts/google-cloud.tts';
import { logger } from '../utils/logger';

export type TTSProviderName = 'openai' | 'elevenlabs' | 'azure' | 'google';

export interface ISpeechSynthesizer {
  readonly providerName: string;
  readonly audioFormat: 'mp3' | 'wav' | 'opus';
  /** Convert text to audio. Returns a Buffer of the audio data (MP3/WAV/Opus). */
  synthesize(text: string): Promise<Buffer>;
}

export function createSpeechSynthesizer(provider: TTSProviderName): ISpeechSynthesizer {
  switch (provider) {
    case 'elevenlabs':
      logger.info('TTS Provider: ElevenLabs');
      return new ElevenLabsTTS();
    case 'azure':
      logger.info('TTS Provider: Azure TTS');
      return new AzureTTS();
    case 'google':
      logger.info('TTS Provider: Google Cloud TTS');
      return new GoogleCloudTTS();
    case 'openai':
    default:
      logger.info('TTS Provider: OpenAI TTS');
      return new OpenAITTS();
  }
}
