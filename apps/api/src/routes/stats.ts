import type { CronRunRepo, DB, SessionRepo } from '@zeno/storage';
import { Hono } from 'hono';

interface CountRow {
  n: number;
}

export interface StatsRouteDeps {
  db: DB;
  cronRuns: CronRunRepo;
  sessions: SessionRepo;
}

export function buildStatsRoute(deps: StatsRouteDeps): Hono {
  const route = new Hono();
  route.get('/', (c) => {
    const activeCrons = (
      deps.db.prepare('SELECT COUNT(*) AS n FROM crons WHERE enabled = 1').get() as CountRow
    ).n;
    const sessions24h = (
      deps.db
        .prepare(
          "SELECT COUNT(*) AS n FROM sessions WHERE last_used_at > datetime('now','-24 hours')",
        )
        .get() as CountRow
    ).n;
    const runsToday = (
      deps.db
        .prepare("SELECT COUNT(*) AS n FROM cron_runs WHERE date(started_at) = date('now')")
        .get() as CountRow
    ).n;
    const failures24h = (
      deps.db
        .prepare(
          "SELECT COUNT(*) AS n FROM cron_runs WHERE status = 'failed' AND started_at > datetime('now','-24 hours')",
        )
        .get() as CountRow
    ).n;
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
