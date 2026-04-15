import pino from 'pino';
import { loadConfig } from './config.js';

export const logger = pino({
  level: loadConfig().logLevel,
  base: { service: 'zeno' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
