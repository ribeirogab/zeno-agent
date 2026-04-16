import { Hono } from 'hono';
import type { ApiConfig } from '@/config';
import { buildAuthRoutes } from '@/routes/auth';
import { healthRoute } from '@/routes/health';

export interface AppDeps {
  config: ApiConfig;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const secure = deps.config.nodeEnv === 'production';
  app.route('/api/health', healthRoute);
  app.route(
    '/api/auth',
    buildAuthRoutes({
      password: deps.config.password,
      sessionSecret: deps.config.sessionSecret,
      secure,
    }),
  );
  return app;
}
