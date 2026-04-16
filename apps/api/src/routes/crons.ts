import { zValidator } from '@hono/zod-validator';
import type { CronRepo, CronRunRepo, CronSource } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';

const listQuery = z.object({
  enabled: z.enum(['true', 'false']).optional(),
  source: z.enum(['static', 'chat']).optional(),
});

export interface CronsRouteDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
}

export function buildCronsRoute(deps: CronsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', zValidator('query', listQuery), (c) => {
    const { enabled, source } = c.req.valid('query');
    const filter: { enabled?: boolean; source?: CronSource } = {};
    if (enabled !== undefined) filter.enabled = enabled === 'true';
    if (source !== undefined) filter.source = source;
    return c.json(deps.crons.list(filter));
  });

  route.get('/:id', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'not_found' }, 404);
    const recentRuns = deps.cronRuns.recent(id, 20);
    return c.json({ cron, recentRuns });
  });

  return route;
}
