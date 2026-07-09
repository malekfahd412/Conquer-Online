import { WhisperSTT } from './providers/stt/whisper.stt';
import { DeepgramSTT } from './providers/stt/deepgram.stt';
import { AssemblyAISTT } from './providers/stt/assemblyai.stt';
import { GoogleSpeechSTT } from './providers/stt/google-speech.stt';
import { logger } from '../utils/logger';

export type STTProviderName = 'whisper' | 'deepgram' | 'assemblyai' | 'google';

export interface ISpeechRecognizer {
  readonly providerName: string;
  /** Recognize speech from a WAV audio buffer (48kHz, 2ch, 16-bit PCM). */
  recognize(wavBuffer: Buffer): Promise<string>;
}

export function createSpeechRecognizer(provider: STTProviderName): ISpeechRecognizer {
  switch (provider) {
    case 'deepgram':
      logger.info('STT Provider: Deepgram');
      return new DeepgramSTT();
    case 'assemblyai':
      logger.info('STT Provider: AssemblyAI');
      return new AssemblyAISTT();
    case 'google':
      logger.info('STT Provider: Google Speech');
      return new GoogleSpeechSTT();
    case 'whisper':
    default:
      logger.info('STT Provider: OpenAI Whisper');
      return new WhisperSTT();
  }
}

/**
 * Convert 48kHz stereo 16-bit PCM to WAV format for STT providers.
 * Discord audio is always: 48000 Hz, 2 channels, S16LE.
 */
export function pcmToWav(pcm: Buffer): Buffer {
  const sampleRate = 48000;
  const channels = 2;
  const bitDepth = 16;
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);

  const header = Buffer.allocUnsafe(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);           // chunk size
  header.writeUInt16LE(1, 20);            // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
