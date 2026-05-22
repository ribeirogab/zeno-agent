// Spec 2026-05-22 (crons CLI-first) — crons API surface is read-only except
// for `POST /:slug/test` (gated by ZENO_API_WRITES). Filesystem is the source
// of truth: GET /:slug/source reads CRON.md at request time; mutations
// happen in the filesystem via the CLI and are reconciled by CronManager.
// The test endpoint enqueues a `cron_test` command so the worker's chat
// backend can fire the cron; the CLI polls /api/commands/:correlationId.

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CommandRepo, CronRepo, CronRunRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';
import type { ApiWriteMode } from '@/lib/api-mode';
import { blockIfCli } from '@/lib/block-if-cli';

export interface CronsRouteDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  commands: CommandRepo;
  /** Absolute path to the crons folder inside the container. Defaults to '/app/crons'. */
  cronsRootDir?: string;
  writes: ApiWriteMode;
}

export function buildCronsRoute(deps: CronsRouteDeps): Hono {
  const route = new Hono();
  const rootDir = deps.cronsRootDir ?? '/app/crons';

  route.get('/', (c) => {
    return c.json(deps.crons.list());
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
      })),
    );
  });

  route.get('/:slug', (c) => {
    const slug = c.req.param('slug');
    const cron = deps.crons.get(slug);
    if (!cron) return c.json({ error: 'not_found' }, 404);
    const recentRuns = deps.cronRuns.recent(slug, 20);
    return c.json({ cron, recentRuns });
  });

  route.get('/:slug/source', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid_slug' }, 400);
    const path = join(rootDir, slug, 'CRON.md');
    try {
      const raw = await fs.readFile(path, 'utf-8');
      return c.json({ raw });
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
  });

  route.post('/:slug/test', async (c) => {
    const blocked = blockIfCli(c, {
      writes: deps.writes,
      action: 'test',
      cli: `zeno cron test ${c.req.param('slug')}`,
    });
    if (blocked) return blocked;

    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid_slug' }, 400);

    // Confirm the cron exists on disk before enqueuing.
    const path = join(rootDir, slug, 'CRON.md');
    try {
      await fs.stat(path);
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }

    const correlationId = randomUUID();
    deps.commands.enqueue({
      type: 'cron_test',
      payload: { slug },
      correlationId,
    });
    return c.json({ correlationId }, 202);
  });

  return route;
}

function isValidSlug(slug: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(slug) && slug.length <= 63;
}
