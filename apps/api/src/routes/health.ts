import type { DB } from '@zeno/storage';
import { Hono } from 'hono';

const startedAt = Date.now();

interface LastTickRow {
  started_at: string | null;
}

export type ServiceStatus = 'ticking' | 'idle' | 'stale' | 'unknown';

export function buildHealthRoute(db: DB): Hono {
  const route = new Hono();
  route.get('/', (c) => {
    const row = db
      .prepare('SELECT started_at FROM cron_runs ORDER BY started_at DESC LIMIT 1')
      .get() as LastTickRow | undefined;
    const lastTickAt = row?.started_at ?? null;
    let runner: ServiceStatus = 'idle';
    if (lastTickAt) {
      const ageMs = Date.now() - new Date(`${lastTickAt}Z`).getTime();
      runner = ageMs < 90_000 ? 'ticking' : 'stale';
    }
    return c.json({
      status: 'ok' as const,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      services: {
        backend: 'unknown' as ServiceStatus,
        slack: 'unknown' as ServiceStatus,
        runner,
      },
      lastTickAt,
    });
  });
  return route;
}
