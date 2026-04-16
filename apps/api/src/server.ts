import type { CommandRepo, CronRepo, CronRunRepo, DB } from '@zeno/storage';
import { SessionRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { requireAuth } from '@/auth/middleware';
import type { ApiConfig } from '@/config';
import { buildActivityRoute } from '@/routes/activity';
import { buildAuthRoutes } from '@/routes/auth';
import { buildCronsRoute } from '@/routes/crons';
import { buildHealthRoute } from '@/routes/health';
import { buildSessionsRoute } from '@/routes/sessions';
import { serveStaticSpa } from '@/routes/static';
import { buildStatsRoute } from '@/routes/stats';

export interface AppDeps {
  config: ApiConfig;
  db: DB;
  cronRepo: CronRepo;
  cronRunRepo: CronRunRepo;
  commandRepo: CommandRepo;
  /** Directory holding Claude Code JSONL transcripts (e.g. `~/.claude/projects/-workspace`). */
  claudeHome: string;
  /** Absolute path to the dashboard's built static assets (apps/dashboard/dist). Optional in tests. */
  spaDir?: string;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const secure = deps.config.nodeEnv === 'production';
  app.route('/api/health', buildHealthRoute(deps.db));
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
  app.use('/api/crons', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.use('/api/crons/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route(
    '/api/crons',
    buildCronsRoute({
      crons: deps.cronRepo,
      cronRuns: deps.cronRunRepo,
      commands: deps.commandRepo,
    }),
  );
  app.use('/api/sessions', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.use('/api/sessions/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route(
    '/api/sessions',
    buildSessionsRoute({
      sessions: new SessionRepo(deps.db),
      claudeHome: deps.claudeHome,
    }),
  );
  if (deps.spaDir) {
    app.get('*', serveStaticSpa(deps.spaDir));
  }
  return app;
}
