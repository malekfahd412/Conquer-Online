import { EndBehaviorType, type VoiceConnection } from '@discordjs/voice';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface UtteranceEvent {
  userId: string;
  /** Raw PCM audio: 48000 Hz, 2ch (stereo), 16-bit signed LE */
  pcm: Buffer;
  durationMs: number;
}

/** Minimum audio duration to process (ms). Filters out clicks/noise bursts. */
const MIN_DURATION_MS = 400;
/** Silence gap after which the stream is closed and utterance is emitted. */
const SILENCE_DURATION_MS = 1500;

export declare interface VoiceReceiver {
  on(event: 'utterance', listener: (evt: UtteranceEvent) => void): this;
  emit(event: 'utterance', evt: UtteranceEvent): boolean;
}

export class VoiceReceiver extends EventEmitter {
  private readonly activeUsers = new Set<string>();
  private isDestroyed = false;

  constructor(private readonly connection: VoiceConnection) {
    super();
    this.setup();
  }

  private setup(): void {
    this.connection.receiver.speaking.on('start', userId => {
      if (this.isDestroyed || this.activeUsers.has(userId)) return;
      this.activeUsers.add(userId);
      this.captureUser(userId);
    });
  }

  private captureUser(userId: string): void {
    const opusStream = this.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_DURATION_MS },
    });

    // Dynamically import prism-media to decode Opus → PCM
    // @discordjs/opus (or opusscript) must be installed for this to work
    import('prism-media').then(prismModule => {
      const prism = prismModule.default ?? prismModule;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const decoder = new (prism as Record<string, Record<string, new (opts: object) => NodeJS.ReadWriteStream>>)['opus']['Decoder']({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      const chunks: Buffer[] = [];
      const startMs = Date.now();

      opusStream.pipe(decoder as unknown as NodeJS.WritableStream);

      decoder.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      decoder.on('end', () => {
        this.activeUsers.delete(userId);
        if (this.isDestroyed) return;

        const durationMs = Date.now() - startMs;
        if (durationMs < MIN_DURATION_MS) return;

        const pcm = Buffer.concat(chunks);
        if (pcm.length < 1920) return; // too small

        this.emit('utterance', { userId, pcm, durationMs });
      });

      decoder.on('error', () => {
        this.activeUsers.delete(userId);
      });

      opusStream.on('error', () => {
        this.activeUsers.delete(userId);
      });
    }).catch(err => {
      logger.error('[VoiceReceiver] Failed to load prism-media', err);
      this.activeUsers.delete(userId);
    });
  }

  destroy(): void {
    this.isDestroyed = true;
    this.removeAllListeners();
    this.activeUsers.clear();
  }
}
