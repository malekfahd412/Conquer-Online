import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import { Readable } from 'stream';
import { logger } from '../utils/logger';

export class VoicePlayer {
  readonly player: AudioPlayer;
  private isDestroyed = false;

  constructor(connection: VoiceConnection) {
    this.player = createAudioPlayer();
    connection.subscribe(this.player);

    this.player.on('error', error => {
      logger.error('[VoicePlayer] Audio player error', error);
    });
  }

  /**
   * Play an audio buffer (MP3/WAV) to the voice channel.
   * Resolves when playback finishes; rejects on error.
   */
  play(audioBuffer: Buffer): Promise<void> {
    if (this.isDestroyed) return Promise.resolve();
    if (!audioBuffer || audioBuffer.length === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      try {
        const stream = Readable.from(audioBuffer);
        // StreamType.Arbitrary lets @discordjs/voice use ffmpeg to transcode MP3 → Opus
        const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });

        const onIdle = (): void => {
          cleanup();
          resolve();
        };
        const onError = (err: Error): void => {
          cleanup();
          reject(err);
        };
        const cleanup = (): void => {
          this.player.removeListener(AudioPlayerStatus.Idle, onIdle);
          this.player.removeListener('error', onError);
        };

        this.player.once(AudioPlayerStatus.Idle, onIdle);
        this.player.once('error', onError);
        this.player.play(resource);
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): void {
    this.player.stop(true);
  }

  get isPlaying(): boolean {
    return this.player.state.status === AudioPlayerStatus.Playing;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.player.stop(true);
  }
}
