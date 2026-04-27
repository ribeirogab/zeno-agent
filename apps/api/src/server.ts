import type {
  ApprovalRulesRepo,
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  DB,
  LogRepo,
} from '@zeno/storage';
import { SessionRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { requireAuth } from '@/auth/middleware';
import type { ApiConfig } from '@/config';
import { buildActivityRoute } from '@/routes/activity';
import { buildApprovalRulesRoute } from '@/routes/approval-rules';
import { buildAuthRoutes } from '@/routes/auth';
import { buildConnectorsRoute } from '@/routes/connectors';
import { buildCronsRoute } from '@/routes/crons';
import { buildHealthRoute } from '@/routes/health';
import { buildLogsRoute } from '@/routes/logs';
import { buildSessionsRoute } from '@/routes/sessions';
import { buildSettingsRoute } from '@/routes/settings';
import { serveStaticSpa } from '@/routes/static';
import { buildStatsRoute } from '@/routes/stats';

export interface AppDeps {
  config: ApiConfig;
  db: DB;
  cronRepo: CronRepo;
  cronRunRepo: CronRunRepo;
  commandRepo: CommandRepo;
  logRepo: LogRepo;
  /** Optional in tests that don't exercise the /api/connectors/* routes. */
  connectorRepo?: ConnectorRepo;
  /** Spec 0044: ConnectorApp repo for /api/connectors/catalog/github-app/* routes. */
  connectorAppRepo?: ConnectorAppRepo;
  /** Spec 0047: ApprovalRules repo for /api/approval-rules. */
  approvalRulesRepo?: ApprovalRulesRepo;
  /** Directory holding Claude Code JSONL transcripts (e.g. `~/.claude/projects/-workspace`). */
  claudeHome: string;
  /** Directory holding the agent profile files (SOUL.md, USER.md, crons.yaml). */
  profileDir: string;
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
  app.use('/api/stats/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route(
    '/api/stats',
    buildStatsRoute({
      db: deps.db,
      cronRuns: deps.cronRunRepo,
      sessions: new SessionRepo(deps.db),
    }),
  );
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
  app.use('/api/settings', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.use('/api/settings/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route(
    '/api/settings',
    buildSettingsRoute({
      commands: deps.commandRepo,
      profileDir: deps.profileDir,
    }),
  );
  app.use('/api/logs', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.use('/api/logs/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
  app.route('/api/logs', buildLogsRoute({ logs: deps.logRepo }));
  if (deps.connectorRepo) {
    app.use('/api/connectors', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.use('/api/connectors/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.route(
      '/api/connectors',
      buildConnectorsRoute({
        connectors: deps.connectorRepo,
        commands: deps.commandRepo,
        ...(deps.connectorAppRepo ? { connectorApps: deps.connectorAppRepo } : {}),
      }),
    );
  }
  // Spec 0047: approval-rules endpoints. Mounted only when both repos are
  // wired (the route's preview endpoint needs access to installed tools).
  if (deps.approvalRulesRepo && deps.connectorRepo) {
    app.use('/api/approval-rules', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.use('/api/approval-rules/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.route(
      '/api/approval-rules',
      buildApprovalRulesRoute({
        rules: deps.approvalRulesRepo,
        connectors: deps.connectorRepo,
      }),
    );
  }
  if (deps.spaDir) {
    app.get('*', serveStaticSpa(deps.spaDir));
  }
  return app;
}
