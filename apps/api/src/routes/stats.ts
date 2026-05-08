import type { CronRunRepo, RuntimeDB, SessionRepo } from '@zeno/db/runtime';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

interface CountRow {
  n: number;
}

export interface StatsRouteDeps {
  db: RuntimeDB;
  cronRuns: CronRunRepo;
  sessions: SessionRepo;
}

export function buildStatsRoute(deps: StatsRouteDeps): Hono {
  const route = new Hono();
  route.get('/', (c) => {
    const activeCrons =
      deps.db.get<CountRow>(sql`SELECT COUNT(*) AS n FROM crons WHERE enabled = 1`)?.n ?? 0;
    const sessions24h =
      deps.db.get<CountRow>(
        sql`SELECT COUNT(*) AS n FROM sessions WHERE last_used_at > datetime('now','-24 hours')`,
      )?.n ?? 0;
    const runsToday =
      deps.db.get<CountRow>(
        sql`SELECT COUNT(*) AS n FROM cron_runs WHERE date(started_at) = date('now')`,
      )?.n ?? 0;
    const failures24h =
      deps.db.get<CountRow>(
        sql`SELECT COUNT(*) AS n FROM cron_runs WHERE status = 'failed' AND started_at > datetime('now','-24 hours')`,
      )?.n ?? 0;
    return c.json({ activeCrons, sessions24h, runsToday, failures24h });
  });

  route.get('/sparkline', (c) => {
    const metric = c.req.query('metric') as 'runs' | 'sessions' | 'failures' | undefined;
    if (!metric || !['runs', 'sessions', 'failures'].includes(metric)) {
      return c.json({ error: 'invalid metric' }, 400);
    }
    const hours = Number(c.req.query('hours') ?? '24') || 24;
    const buckets =
      metric === 'sessions'
        ? deps.sessions.sparkline(hours)
        : deps.cronRuns.sparkline(metric, hours);
    return c.json({ buckets });
  });

  return route;
}
