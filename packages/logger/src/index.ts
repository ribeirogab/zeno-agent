import pino, { type Logger } from 'pino';

export interface CreateLoggerOptions {
  service: string;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const level = process.env.LOG_LEVEL ?? 'info';
  return pino({
    level,
    base: { service: options.service },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger };
