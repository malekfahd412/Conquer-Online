import { logger } from '../utils/logger';

export interface LatencyReport {
  sttMs: number;
  aiMs: number;
  ttsMs: number;
  totalMs: number;
}

export class LatencyMonitor {
  private readonly marks = new Map<string, number>();
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  mark(label: string): void {
    this.marks.set(label, Date.now());
  }

  elapsed(from: string, to: string): number {
    const a = this.marks.get(from);
    const b = this.marks.get(to);
    if (a === undefined || b === undefined) return 0;
    return b - a;
  }

  totalMs(): number {
    return Date.now() - this.startTime;
  }

  report(): LatencyReport {
    return {
      sttMs: this.elapsed('stt_start', 'stt_end'),
      aiMs: this.elapsed('ai_start', 'ai_end'),
      ttsMs: this.elapsed('tts_start', 'tts_end'),
      totalMs: this.totalMs(),
    };
  }

  log(prefix = '[Voice Latency]'): void {
    const r = this.report();
    logger.info(
      `${prefix} STT: ${r.sttMs}ms | AI: ${r.aiMs}ms | TTS: ${r.ttsMs}ms | Total: ${r.totalMs}ms`,
    );
  }
}
