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

/**
 * Serializes a CCPayload to JSON (calling .toJSON() on every Builder),
 * prints every component custom_id row-by-row, then throws if any
 * duplicate is found. Call this at every send point before touching Discord.
 *
 * Discord.js stores custom IDs as `data.custom_id` — NOT accessible as a
 * `.customId` TS property. JSON.stringify triggers each Builder's .toJSON().
 */
export function assertUniqueCustomIds(label: string, payload: { components?: unknown[] }): void {
  interface RawComp { custom_id?: string }
  interface RawRow  { components?: RawComp[] }
  interface RawRoot { components?: RawRow[] }

  const raw = JSON.parse(JSON.stringify(payload)) as RawRoot;
  const rows = raw.components ?? [];

  // ── Row-by-row print ──────────────────────────────────────────────────────
  logger.info(`[CC][assert] ── ${label} (${rows.length} row${rows.length !== 1 ? 's' : ''}) ──`);
  const all: Array<{ id: string; row: number; col: number }> = [];
  for (const [ri, row] of rows.entries()) {
    const comps = row.components ?? [];
    const ids = comps.map(c => c.custom_id ?? '(none)');
    logger.info(`[CC][assert]   Row ${ri}: ${ids.map(id => `"${id}"`).join(', ')}`);
    for (const [ci, comp] of comps.entries()) {
      if (comp.custom_id) all.push({ id: comp.custom_id, row: ri, col: ci });
    }
  }

  // ── Duplicate check ───────────────────────────────────────────────────────
  const seen = new Map<string, { row: number; col: number }>();
  for (const { id, row, col } of all) {
    if (seen.has(id)) {
      const first = seen.get(id)!;
      const msg =
        `[CC][DUPLICATE_CUSTOM_ID] ${label}\n` +
        `  Duplicate ID:  "${id}"\n` +
        `  First at:      Row ${first.row}, Component ${first.col}\n` +
        `  Duplicate at:  Row ${row}, Component ${col}`;
      logger.error(msg);
      throw new Error(`Duplicate custom_id "${id}" in ${label} — Row ${row}, Component ${col}`);
    }
    seen.set(id, { row, col });
  }
  logger.info(`[CC][assert]   ✅ All ${all.length} IDs unique`);
}

/** @deprecated Use assertUniqueCustomIds — kept for any legacy call sites */
export function validatePayload(label: string, payload: { components?: unknown[] }): void {
  assertUniqueCustomIds(label, payload);
}
