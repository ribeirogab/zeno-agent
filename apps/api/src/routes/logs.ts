import { zValidator } from '@hono/zod-validator';
import type { LogFilter, LogLevel, LogRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

const levelName = z.enum(['info', 'warn', 'error']);
const levelMap: Record<z.infer<typeof levelName>, LogLevel> = {
  info: 30,
  warn: 40,
  error: 50,
};

const listQuery = z.object({
  level: levelName.optional(),
  q: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  cursorId: z.coerce.number().int().min(1).optional(),
  sinceId: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export interface LogsRouteDeps {
  logs: LogRepo;
}

export function buildLogsRoute(deps: LogsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', zValidator('query', listQuery), (c) => {
    const { level, q, since, until, cursorId, limit } = c.req.valid('query');
    const filter: LogFilter = {};
    if (level !== undefined) filter.level = levelMap[level];
    if (q !== undefined) filter.q = q;
    if (since !== undefined) filter.since = since;
    if (until !== undefined) filter.until = until;
    if (cursorId !== undefined) filter.cursorId = cursorId;
    if (limit !== undefined) filter.limit = limit;
    const result = deps.logs.list(filter);
    return c.json(result);
  });

  route.get('/stream', zValidator('query', listQuery), (c) => {
    const { level, q, since, until, sinceId: sinceIdParam } = c.req.valid('query');
    const levelNum = level ? levelMap[level] : undefined;

    return streamSSE(c, async (stream) => {
      const head = deps.logs.list({ limit: 1 });
      let lastId = sinceIdParam ?? head.logs[0]?.id ?? 0;
      let lastHeartbeat = Date.now();

      const tick = async (): Promise<void> => {
        const filter: LogFilter & { sinceId: number } = { sinceId: lastId, limit: 200 };
        if (levelNum !== undefined) filter.level = levelNum;
        if (q !== undefined) filter.q = q;
        if (since !== undefined) filter.since = since;
        if (until !== undefined) filter.until = until;
        const batch = deps.logs.listSince(filter);
        for (const log of batch) {
          await stream.writeSSE({ id: String(log.id), data: JSON.stringify(log) });
          lastId = log.id;
        }
        if (Date.now() - lastHeartbeat > 30_000) {
          await stream.writeSSE({ event: 'ping', data: '' });
          lastHeartbeat = Date.now();
        }
      };

      let aborted = false;
      stream.onAbort(() => {
        aborted = true;
      });

      while (!aborted) {
        await tick();
        await stream.sleep(500);
      }
    });
  });

  return route;
}
