import type { DB } from '@zeno/storage';
import { Hono } from 'hono';
import { requireAuth } from '@/auth/middleware';
import type { ApiConfig } from '@/config';
import { buildActivityRoute } from '@/routes/activity';
import { buildAuthRoutes } from '@/routes/auth';
import { healthRoute } from '@/routes/health';
import { buildStatsRoute } from '@/routes/stats';

export interface AppDeps {
  config: ApiConfig;
  db: DB;
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
  app.use('/api/stats', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route('/api/stats', buildStatsRoute(deps.db));
  app.use('/api/activity', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route('/api/activity', buildActivityRoute(deps.db));
  return app;
}
