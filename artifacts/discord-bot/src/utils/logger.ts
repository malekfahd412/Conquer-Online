type LogLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

const COLORS: Record<LogLevel | 'RESET' | 'DIM', string> = {
  INFO: '\x1b[36m',
  SUCCESS: '\x1b[32m',
  WARNING: '\x1b[33m',
  ERROR: '\x1b[31m',
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, error?: unknown): void {
  const color = COLORS[level];
  const timestamp = formatTimestamp();
  const prefix = `${COLORS.DIM}[${timestamp}]${COLORS.RESET} ${color}[${level}]${COLORS.RESET}`;

  process.stdout.write(`${prefix} ${message}\n`);

  if (error instanceof Error) {
    process.stderr.write(`${COLORS.ERROR}${error.message}${COLORS.RESET}\n`);
    if (error.stack) {
      process.stderr.write(`${COLORS.DIM}${error.stack}${COLORS.RESET}\n`);
    }
  } else if (error !== undefined) {
    process.stderr.write(`${COLORS.ERROR}${String(error)}${COLORS.RESET}\n`);
  }
}

export const logger = {
  info: (message: string): void => log('INFO', message),
  success: (message: string): void => log('SUCCESS', message),
  warning: (message: string, error?: unknown): void => log('WARNING', message, error),
  error: (message: string, error?: unknown): void => log('ERROR', message, error),
};
