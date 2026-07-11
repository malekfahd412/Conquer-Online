import { logger } from '../../utils/logger';

/**
 * Instrumentation for every numeric value that flows into a discord.js
 * Builder. Logs file/function/variable/value before use, and — if the
 * value is out of the range discord.js will accept — logs a detailed
 * diagnostic (with stack trace) and returns a safe fallback instead of
 * letting discord.js throw a generic "Invalid number value" error.
 */
export interface NumberCheckCtx {
  file: string;
  fn: string;
  name: string;
  value: number;
  min?: number;
  max?: number;
  fallback: number;
  /** Whether the value must be an integer (Discord numeric fields are). */
  integer?: boolean;
}

export function checkNumber(ctx: NumberCheckCtx): number {
  const { file, fn, name, value, min, max, fallback, integer = true } = ctx;

  const isFinite_ = Number.isFinite(value);
  const isInt = !integer || Number.isInteger(value);
  const withinMin = min === undefined || value >= min;
  const withinMax = max === undefined || value <= max;
  const valid = isFinite_ && isInt && withinMin && withinMax;

  if (valid) {
    logger.info(`[CC][debug] ${file}::${fn} ${name}=${value} range=[${min ?? '-inf'},${max ?? '+inf'}] OK`);
    return value;
  }

  const reason = !isFinite_
    ? 'not a finite number (NaN/Infinity)'
    : !isInt
    ? 'not an integer'
    : !withinMin
    ? `below minimum ${min}`
    : `above maximum ${max}`;

  const stack = new Error(`[CC][INVALID NUMBER] ${name}`).stack;
  logger.error(
    `[CC][INVALID NUMBER] ${file}::${fn} — "${name}" = ${value} (${reason}). ` +
    `Allowed range: [${min ?? '-inf'}, ${max ?? '+inf'}]. Falling back to ${fallback}.\n${stack}`,
  );
  return fallback;
}

/** Logs + validates an embed color (0x000000 - 0xFFFFFF). */
export function checkColor(file: string, fn: string, name: string, value: number): number {
  return checkNumber({ file, fn, name, value, min: 0, max: 0xffffff, fallback: 0x5865f2 });
}

/** Logs + validates a ButtonStyle enum value (1-5; Link=5 requires a URL, so we exclude it from the safe fallback range here). */
export function checkButtonStyle(file: string, fn: string, name: string, value: number): number {
  return checkNumber({ file, fn, name, value, min: 1, max: 5, fallback: 2 /* Secondary */ });
}

/** Logs + validates a StringSelectMenu min/maxValues (0-25 per Discord limits). */
export function checkSelectMinMax(file: string, fn: string, name: string, value: number, fallback: number): number {
  return checkNumber({ file, fn, name, value, min: 0, max: 25, fallback });
}

/** Logs + validates a TextInput minLength/maxLength (Discord hard limits: 0-4000). */
export function checkTextInputLength(file: string, fn: string, name: string, value: number, fallback: number): number {
  return checkNumber({ file, fn, name, value, min: 0, max: 4000, fallback });
}

/** Logs + validates an option/component count against a Discord array limit. */
export function checkCount(file: string, fn: string, name: string, value: number, max: number, fallback: number): number {
  return checkNumber({ file, fn, name, value, min: 0, max, fallback });
}

/** Logs + validates a page/pagination index (must be a non-negative integer). */
export function checkPageIndex(file: string, fn: string, name: string, value: number, maxPage: number): number {
  return checkNumber({ file, fn, name, value, min: 0, max: maxPage, fallback: 0 });
}

/**
 * Wraps a Discord Builder construction step. Logs the failure with full
 * context (file/fn/stack) and re-throws a descriptive error carrying the
 * real cause instead of the generic message discord.js produces.
 */
export function verifyBuilder<T>(file: string, fn: string, label: string, build: () => T): T {
  try {
    return build();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : new Error().stack;
    logger.error(`[CC][BUILDER FAILED] ${file}::${fn} — building "${label}" threw: ${message}\n${stack}`);
    throw new Error(`${label} failed to build: ${message}`);
  }
}
