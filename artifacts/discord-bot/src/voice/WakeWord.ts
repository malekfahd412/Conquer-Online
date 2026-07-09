/** Wake word and goodbye detection for the voice pipeline. */

const WAKE_WORDS: string[] = [
  'mufasa',
  'hey mufasa',
  'hey, mufasa',
  'ok mufasa',
  'okay mufasa',
];

const GOODBYE_WORDS: string[] = [
  'goodbye mufasa',
  'goodbye',
  'bye mufasa',
  'bye',
  'stop listening',
  'go to sleep',
  'sleep',
  'that\'s all',
  'nevermind',
  'never mind',
];

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z\s']/g, '');
}

export class WakeWord {
  /** Returns true if the text contains a wake word. */
  static detect(text: string): boolean {
    const n = normalize(text);
    return WAKE_WORDS.some(w => n.includes(w));
  }

  /** Returns true if the text is a goodbye phrase. */
  static isGoodbye(text: string): boolean {
    const n = normalize(text);
    return GOODBYE_WORDS.some(g => n.includes(g));
  }

  /**
   * Strip the leading wake word from the text so the AI only sees the command.
   * E.g. "Hey Mufasa, create a channel" → "create a channel"
   */
  static strip(text: string): string {
    const n = normalize(text);
    for (const ww of [...WAKE_WORDS].sort((a, b) => b.length - a.length)) {
      if (n.startsWith(ww)) {
        return text.slice(ww.length).replace(/^[\s,.:]+/, '').trim();
      }
      const idx = n.indexOf(ww);
      if (idx !== -1) {
        const after = text.slice(idx + ww.length).replace(/^[\s,.:]+/, '').trim();
        if (after) return after;
      }
    }
    return text.trim();
  }

  static get wakeWordList(): string[] {
    return [...WAKE_WORDS];
  }
}
