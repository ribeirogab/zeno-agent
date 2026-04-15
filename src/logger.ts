import pino from 'pino';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function pickLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL;
  if (envLevel && (LOG_LEVELS as readonly string[]).includes(envLevel)) {
    return envLevel as LogLevel;
  }
  return 'info';
}

export const logger = pino({
  level: pickLevel(),
  base: { service: 'zeno' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
