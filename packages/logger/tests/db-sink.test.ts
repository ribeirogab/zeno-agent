import { describe, expect, it } from 'vitest';
import { createLogger, type LogSink } from '../src/index.js';

interface Captured {
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

function makeSink(): { sink: LogSink; captured: Captured[] } {
  const captured: Captured[] = [];
  const sink: LogSink = { insert: (input) => captured.push(input) };
  return { sink, captured };
}

describe('createLogger with dbSink', () => {
  it('is a no-op shape change when dbSink is absent (stdout only)', () => {
    const logger = createLogger({ service: 'worker' });
    expect(typeof logger.info).toBe('function');
  });

  it('captures info lines and extracts event + correlationId + message', async () => {
    const { sink, captured } = makeSink();
    const logger = createLogger({ service: 'worker', dbSink: sink });
    logger.info({ event: 'boot', correlationId: 'c-1' }, 'zeno booting');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captured).toHaveLength(1);
    const [first] = captured;
    expect(first?.service).toBe('worker');
    expect(first?.level).toBe(30);
    expect(first?.event).toBe('boot');
    expect(first?.correlationId).toBe('c-1');
    expect(first?.message).toBe('zeno booting');
    expect(first?.payload.startsWith('{')).toBe(true);
  });

  it('leaves event / correlationId as null when absent', async () => {
    const { sink, captured } = makeSink();
    const logger = createLogger({ service: 'api', dbSink: sink });
    logger.warn('just a message');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.event).toBeNull();
    expect(captured[0]?.correlationId).toBeNull();
    expect(captured[0]?.level).toBe(40);
  });

  it('does not throw when the sink insert throws', async () => {
    const sink: LogSink = {
      insert: () => {
        throw new Error('boom');
      },
    };
    const logger = createLogger({ service: 'worker', dbSink: sink });
    expect(() => logger.info({ event: 'x' }, 'boom test')).not.toThrow();
  });

  it('forwards multiple log levels', async () => {
    const { sink, captured } = makeSink();
    const logger = createLogger({ service: 'worker', dbSink: sink });
    logger.info({ event: 'i' }, 'i');
    logger.warn({ event: 'w' }, 'w');
    logger.error({ event: 'e' }, 'e');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captured.map((c) => c.level)).toEqual([30, 40, 50]);
  });
});
