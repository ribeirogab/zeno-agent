import { zValidator } from '@hono/zod-validator';
import type { LogFilter, LogLevel, LogRepo } from '@zeno/storage';
import { Hono } from 'hono';
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

  return route;
}
