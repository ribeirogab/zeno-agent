import { Writable } from 'node:stream';
import pino, { type Logger } from 'pino';

export interface LogSink {
  insert(input: {
    ts: string;
    level: number;
    service: string;
    event: string | null;
    correlationId: string | null;
    message: string | null;
    payload: string;
  }): void;
}

export interface CreateLoggerOptions {
  service: string;
  dbSink?: LogSink;
}

interface ParsedLogLine {
  time?: string;
  level?: number;
  event?: unknown;
  correlationId?: unknown;
  msg?: unknown;
}

function makeSinkStream(sink: LogSink, service: string): Writable {
  return new Writable({
    write(chunk, _encoding, callback): void {
      try {
        const text = chunk.toString('utf8');
        const parsed = JSON.parse(text) as ParsedLogLine;
        const event = typeof parsed.event === 'string' ? parsed.event : null;
        const correlationId =
          typeof parsed.correlationId === 'string' ? parsed.correlationId : null;
        const message = typeof parsed.msg === 'string' ? parsed.msg : null;
        const ts = typeof parsed.time === 'string' ? parsed.time : new Date().toISOString();
        const level = typeof parsed.level === 'number' ? parsed.level : 30;
        sink.insert({
          ts,
          level,
          service,
          event,
          correlationId,
          message,
          payload: text,
        });
      } catch (err) {
        // Sink failure must never kill the stream; surface to stderr so it's
        // visible in docker logs even when the Logs page is broken.
        process.stderr.write(
          `[logger] dbSink insert failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      callback();
    },
  });
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const level = process.env.LOG_LEVEL ?? 'info';
  const base = { service: options.service };
  if (!options.dbSink) {
    return pino({
      level,
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  const sinkStream = makeSinkStream(options.dbSink, options.service);
  const stdoutStream: pino.StreamEntry = { level: 'trace', stream: process.stdout };
  const dbStream: pino.StreamEntry = { level: 'trace', stream: sinkStream };
  return pino(
    {
      level,
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([stdoutStream, dbStream]),
  );
}

export type { Logger };
