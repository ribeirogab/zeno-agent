import { zValidator } from '@hono/zod-validator';
import type { RuntimeDB } from '@zeno/db/runtime';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

interface ActivityRow {
  id: string;
  cron_id: string;
  cron_name: string;
  started_at: string;
  status: string;
  output: string | null;
  error: string | null;
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

function summarize(cronName: string, status: string): string {
  if (status === 'success') return `${cronName} completed`;
  if (status === 'failed') return `${cronName} failed`;
  return `${cronName} ${status}`;
}

export function buildActivityRoute(db: RuntimeDB): Hono {
  const route = new Hono();
  route.get('/', zValidator('query', querySchema), (c) => {
    const { limit } = c.req.valid('query');
    const rows = db.all<ActivityRow>(
      sql`SELECT cr.id, cr.cron_id, c.name AS cron_name, cr.started_at, cr.status, cr.output, cr.error
         FROM cron_runs cr
         INNER JOIN crons c ON c.id = cr.cron_id
         ORDER BY cr.started_at DESC
         LIMIT ${limit}`,
    );
    return c.json(
      rows.map((r) => ({
        id: r.id,
        kind: 'cron_run' as const,
        timestamp: r.started_at,
        summary: summarize(r.cron_name, r.status),
        status: r.status,
      })),
    );
  });
  return route;
}
