import { Hono } from 'hono';
import type { ApiConfig } from '@/config';
import { healthRoute } from '@/routes/health';

export interface AppDeps {
  config: ApiConfig;
}

export function createApp(_deps: AppDeps): Hono {
  const app = new Hono();
  app.route('/api/health', healthRoute);
  return app;
}
