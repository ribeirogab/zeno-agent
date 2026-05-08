/**
 * Cron ↔ connector M:N link API. Spec 0054.
 *
 * Mounted as a sub-route under /api/crons/:id/connectors. The link is a
 * hint to the agent (surfaced in the [zeno_context] block + audit log
 * `cron_used_unlinked_connector` for unlinked uses); the connector-
 * permission gate (spec 0050) stays the single allow/deny authority.
 */

import { zValidator } from '@hono/zod-validator';
import type { CronConnectorRepo, CronRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';
import { z } from 'zod';

export interface CronConnectorsRouteDeps {
  crons: CronRepo;
  cronConnectors: CronConnectorRepo;
}

const replaceBody = z.object({
  connectorIds: z.array(z.string()),
});

export function buildCronConnectorsRoute(deps: CronConnectorsRouteDeps): Hono {
  const route = new Hono();

  route.get('/:id/connectors', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'cron_not_found' }, 404);
    const linked = deps.cronConnectors.listForCron(id).map((conn) => ({
      id: conn.id,
      slug: conn.slug,
      displayName: conn.displayName,
      status: conn.status,
    }));
    return c.json(linked);
  });

  route.patch('/:id/connectors', zValidator('json', replaceBody), (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'cron_not_found' }, 404);
    const { connectorIds } = c.req.valid('json');
    deps.cronConnectors.replaceForCron(id, connectorIds);
    return c.body(null, 204);
  });

  return route;
}
