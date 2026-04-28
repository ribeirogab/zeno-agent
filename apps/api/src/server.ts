import { createLogger } from '@zeno/logger';
import type {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  DB,
  LogRepo,
  SkillRepo,
} from '@zeno/storage';
import { SessionRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { requireAuth } from '@/auth/middleware';
import type { ApiConfig } from '@/config';
import { buildActivityRoute } from '@/routes/activity';
import { buildAgentCapabilitiesRoute } from '@/routes/agent-capabilities';
import { buildAuthRoutes } from '@/routes/auth';
import { buildConnectorSkillsRoute } from '@/routes/connector-skills';
import { buildConnectorsRoute } from '@/routes/connectors';
import { buildCronConnectorsRoute } from '@/routes/cron-connectors';
import { buildCronSkillsRoute } from '@/routes/cron-skills';
import { buildCronsRoute } from '@/routes/crons';
import { buildHealthRoute } from '@/routes/health';
import { buildLogsRoute } from '@/routes/logs';
import { buildSessionsRoute } from '@/routes/sessions';
import { buildSettingsRoute } from '@/routes/settings';
import { buildSkillsRoute } from '@/routes/skills';
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
  /** Spec 0052: skills CRUD + agent-capabilities + connector-skills link. Optional in tests that don't exercise those routes. */
  skillRepo?: SkillRepo;
  /** Spec 0052: connector ↔ skills M:N. Required iff `skillRepo` is set. */
  connectorSkillRepo?: ConnectorSkillRepo;
  /** Spec 0054: cron ↔ skills M:N. Optional in tests that don't exercise the link routes. */
  cronSkillRepo?: CronSkillRepo;
  /** Spec 0054: cron ↔ connectors M:N. Optional in tests that don't exercise the link routes. */
  cronConnectorRepo?: CronConnectorRepo;
  /** Spec 0052: global non-MCP tool toggles. Optional independent of skills. */
  agentCapabilityRepo?: AgentCapabilityRepo;
  /** Directory holding Claude Code JSONL transcripts (e.g. `~/.claude/projects/-workspace`). */
  claudeHome: string;
  /** Spec 0052: absolute path to ${claudeHome} (`~/.claude`) for skill materialization. Defaults to deps.claudeHome's parent dir if not set. */
  claudeHomeRoot?: string;
  /** Directory holding the agent profile files (SOUL.md, USER.md, crons.yaml). */
  profileDir: string;
  /** Absolute path to the dashboard's built static assets (apps/dashboard/dist). Optional in tests. */
  spaDir?: string;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const secure = deps.config.nodeEnv === 'production';
  const apiLogger = createLogger({ service: 'api' });
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
  // Spec 0054: cron ↔ skills + connectors M:N (mounted under /api/crons,
  // auth covered by the /api/crons* middleware above).
  if (deps.cronSkillRepo) {
    app.route(
      '/api/crons',
      buildCronSkillsRoute({ crons: deps.cronRepo, cronSkills: deps.cronSkillRepo }),
    );
  }
  if (deps.cronConnectorRepo) {
    app.route(
      '/api/crons',
      buildCronConnectorsRoute({
        crons: deps.cronRepo,
        cronConnectors: deps.cronConnectorRepo,
      }),
    );
  }
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
  // Spec 0052: skills (CRUD + downloads).
  if (deps.skillRepo && deps.claudeHomeRoot) {
    app.use('/api/skills', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.use('/api/skills/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.route(
      '/api/skills',
      buildSkillsRoute({
        skills: deps.skillRepo,
        claudeHome: deps.claudeHomeRoot,
        logger: apiLogger,
      }),
    );
  }
  // Spec 0052: agent capabilities (global non-MCP tool toggles).
  if (deps.agentCapabilityRepo) {
    app.use('/api/agent-capabilities', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.use(
      '/api/agent-capabilities/*',
      requireAuth({ secret: deps.config.sessionSecret, secure }),
    );
    app.route(
      '/api/agent-capabilities',
      buildAgentCapabilitiesRoute({ agentCapabilities: deps.agentCapabilityRepo }),
    );
  }
  // Spec 0052: connector ↔ skills M:N (mounted under /api/connectors).
  if (deps.connectorRepo && deps.connectorSkillRepo) {
    // Auth is already covered by the /api/connectors* middleware above.
    app.route(
      '/api/connectors',
      buildConnectorSkillsRoute({
        connectors: deps.connectorRepo,
        connectorSkills: deps.connectorSkillRepo,
      }),
    );
  }
  if (deps.spaDir) {
    app.get('*', serveStaticSpa(deps.spaDir));
  }
  return app;
}
