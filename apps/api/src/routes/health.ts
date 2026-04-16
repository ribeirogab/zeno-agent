import { Hono } from 'hono';

const startedAt = Date.now();

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  return c.json({
    status: 'ok' as const,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});
