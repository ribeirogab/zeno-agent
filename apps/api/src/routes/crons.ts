import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import type { CommandRepo, CronRepo, CronRunRepo, CronSource } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';

const listQuery = z.object({
  enabled: z.enum(['true', 'false']).optional(),
  source: z.enum(['static', 'chat']).optional(),
});

const createBody = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().optional(),
  prompt: z.string().min(1),
  schedule: z.string().min(1),
  notifyConversationId: z.string().nullish(),
  notifyThreadId: z.string().nullish(),
});

export interface CronsRouteDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  commands: CommandRepo;
}

function enqueue(
  deps: CronsRouteDeps,
  type: 'cron_pause' | 'cron_resume' | 'cron_run_now' | 'cron_delete',
  cronId: string,
): void {
  deps.commands.enqueue({
    type,
    payload: { cronId },
    correlationId: randomUUID(),
  });
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

  route.get('/next', (c) => {
    const limit = Number(c.req.query('limit') ?? '3') || 3;
    const crons = deps.crons.next(limit);
    return c.json(
      crons.map((cron) => ({
        id: cron.id,
        name: cron.name,
        schedule: cron.schedule,
        nextRunAt: cron.nextRunAt,
        notifyConversationId: cron.notifyConversationId ?? undefined,
      })),
    );
  });

  route.get('/:id', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'not_found' }, 404);
    const recentRuns = deps.cronRuns.recent(id, 20);
    return c.json({ cron, recentRuns });
  });

  route.post('/', zValidator('json', createBody), (c) => {
    const body = c.req.valid('json');
    deps.commands.enqueue({
      type: 'cron_create',
      payload: body,
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  route.post('/:id/pause', (c) => {
    const id = c.req.param('id');
    if (!deps.crons.get(id)) return c.json({ error: 'not_found' }, 404);
    enqueue(deps, 'cron_pause', id);
    return c.body(null, 204);
  });

  route.post('/:id/resume', (c) => {
    const id = c.req.param('id');
    if (!deps.crons.get(id)) return c.json({ error: 'not_found' }, 404);
    enqueue(deps, 'cron_resume', id);
    return c.body(null, 204);
  });

  route.post('/:id/run-now', (c) => {
    const id = c.req.param('id');
    if (!deps.crons.get(id)) return c.json({ error: 'not_found' }, 404);
    enqueue(deps, 'cron_run_now', id);
    return c.body(null, 204);
  });

  route.delete('/:id', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'not_found' }, 404);
    if (cron.source === 'static') {
      return c.json({ error: 'cannot_delete_static' }, 409);
    }
    enqueue(deps, 'cron_delete', id);
    return c.body(null, 204);
  });

  return route;
}
