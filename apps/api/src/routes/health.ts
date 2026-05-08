import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuntimeDB } from '@zeno/db/runtime';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

const startedAt = Date.now();

interface LastTickRow {
  started_at: string | null;
}

export type ServiceStatus = 'ticking' | 'idle' | 'stale' | 'unknown';

// dashboard-cleanup spec: expose the running zeno-agent version on /api/health
// so the dashboard sidebar can display the actual installed CalVer tag instead
// of a hardcoded literal. Resolve once at boot — package.json never changes
// for the lifetime of a container.
function resolveVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    let dir = here;
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
        if (pkg.version && pkg.version !== '0.0.1') return `v${pkg.version}`;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* fall through */
  }
  return 'v0.0.0-dev';
}

const VERSION = resolveVersion();

export function buildHealthRoute(db: RuntimeDB): Hono {
  const route = new Hono();
  route.get('/', (c) => {
    const row = db.get<LastTickRow>(
      sql`SELECT started_at FROM cron_runs ORDER BY started_at DESC LIMIT 1`,
    );
    const lastTickAt = row?.started_at ?? null;
    let runner: ServiceStatus = 'idle';
    if (lastTickAt) {
      const ageMs = Date.now() - new Date(`${lastTickAt}Z`).getTime();
      runner = ageMs < 90_000 ? 'ticking' : 'stale';
    }
    return c.json({
      status: 'ok' as const,
      version: VERSION,
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
