import { Hono } from 'hono';
import type { ApiWriteMode } from '@/lib/api-mode';

export function buildModeRoute(opts: { writes: ApiWriteMode }): Hono {
  const route = new Hono();
  route.get('/', (c) => c.json({ writes: opts.writes }));
  return route;
}
