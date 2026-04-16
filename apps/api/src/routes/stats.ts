import type { DB } from '@zeno/storage';
import { Hono } from 'hono';

interface CountRow {
  n: number;
}

export function buildStatsRoute(db: DB): Hono {
  const route = new Hono();
  route.get('/', (c) => {
    const activeCrons = (
      db.prepare('SELECT COUNT(*) AS n FROM crons WHERE enabled = 1').get() as CountRow
    ).n;
    const sessions24h = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sessions WHERE last_used_at > datetime('now','-24 hours')",
        )
        .get() as CountRow
    ).n;
    const runsToday = (
      db
        .prepare("SELECT COUNT(*) AS n FROM cron_runs WHERE date(started_at) = date('now')")
        .get() as CountRow
    ).n;
    const failures24h = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM cron_runs WHERE status = 'failed' AND started_at > datetime('now','-24 hours')",
        )
        .get() as CountRow
    ).n;
    return c.json({ activeCrons, sessions24h, runsToday, failures24h });
  });
  return route;
}
