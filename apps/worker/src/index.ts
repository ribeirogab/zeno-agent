import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  AgentCapabilityRepo,
  BackendCredentialsRepo,
  BackendSettingsRepo,
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  LogRepo,
  openRuntimeDatabase,
  runRuntimeMigrations,
  SessionRepo,
  SkillRepo,
  seedDefaultAgentCapabilities,
  seedDefaultConnectors,
} from '@zeno/db/runtime';
import { createLogger, type Logger } from '@zeno/logger';
import { ClaudeCodeBackend, type InvocationEvent } from '@/agent/backends/claude-code';
import { MockBackend } from '@/agent/backends/mock';
import { loadMockFixtures } from '@/agent/backends/mock-fixtures';
import { AgentCore } from '@/agent/core';
import { CredentialsService } from '@/agent/credentials';
import { materializeClaudeCredentials } from '@/agent/credentials-materializer';
import { CredentialsWatcher } from '@/agent/credentials-watcher';
import type { McpServerConfig } from '@/agent/mcp';
import { buildMcpServersMap } from '@/agent/mcp-build';
import { buildSystemPrompt, loadAgentFile, loadProfileFile } from '@/agent/system-prompt';
import type { AgentBackend } from '@/agent/types';
import { ChannelManager, type ChannelRow } from '@/channels/manager';
import { SlackChannel } from '@/channels/slack/adapter';
import type { Channel } from '@/channels/types';
import { buildDispatcher } from '@/commands/dispatcher';
import { buildHandlerMap } from '@/commands/handlers';
import { CommandsPoller } from '@/commands/poller';
import { type Config, loadConfig } from '@/config';
// Spec 2026-05-22 (crons CLI-first): legacy CronRunner + cron MCP tools retired.
// CronManager owns the cron lifecycle and reads CRON.md files at fire time.
import { CronManager } from '@/cron/manager';
import { type GitHubAppAuth, loadGitHubAppFromDb } from '@/github/app-auth';
import { resolveGitIdentity } from '@/github/git-identity';
import { ConnectorGatedBackend } from '@/guardrails/connector-gated-backend';
import { type LoadResult as KnowledgeLoadResult, loadKnowledgeBlock } from '@/knowledge/loader';
import { LogsRetention } from '@/logs/retention';
import { ProfileWatcher } from '@/profile/watcher';
import { cleanupTmpExtractDirs, materializeSkillsToFs } from '@/skills/materialize';
import { preMigrateBodiesToFs } from '@/skills/migrate-bodies-to-fs';
import { bootSkillsReconcile } from '@/skills/seed';

interface RunResult {
  code: number | null;
  out: string;
  err: string;
}

async function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    child.stdout?.on('data', (data) => {
      out += data.toString();
    });
    child.stderr?.on('data', (data) => {
      err += data.toString();
    });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

interface BackendBuildOptions {
  getMcpServers: () => Record<string, McpServerConfig>;
  // biome-ignore lint/suspicious/noExplicitAny: in-process MCP server type is not exported
  inProcessMcpServers?: Record<string, any>;
  onInvocation?: (event: InvocationEvent) => void;
  /** Spec 0071: per-call env provider — never mutate process.env. */
  envProvider?: () => Record<string, string | undefined> | undefined;
}

/**
 * Spec 0072 — pick the agent backend based on `backend_settings.active_backend_id`
 * (per profile, runtime DB), no longer the ZENO_BACKEND env. Default is the
 * real Claude SDK; 'mock' is for dev/tests (E2E fixture seeds `active_backend_id='mock'`).
 * Throws on unknown values so a typo never silently degrades to a mock in prod.
 */
function buildBackend(logger: Logger, slug: string, opts: BackendBuildOptions): AgentBackend {
  switch (slug) {
    case 'claude-code':
      logger.info({ event: 'backend_selected', backend: 'claude-code' }, 'using ClaudeCodeBackend');
      return new ClaudeCodeBackend({
        getMcpServers: opts.getMcpServers,
        inProcessMcpServers: opts.inProcessMcpServers,
        onInvocation: opts.onInvocation,
        envProvider: opts.envProvider,
      });
    case 'mock':
      logger.info({ event: 'backend_selected', backend: 'mock' }, 'using MockBackend');
      return new MockBackend(loadMockFixtures());
    default:
      throw new Error(
        `Unknown active_backend_id='${slug}' (expected 'claude-code' or 'mock'). Set via the runtime DB (zeno backend) or E2E fixture.`,
      );
  }
}

async function healthChecks(logger: Logger, _config: Config): Promise<void> {
  // Spec 0044: GitHub access lives in `connector_apps` (App installation
  // tokens minted by app-auth.ts). The legacy `gh auth status` boot probe
  // against a global GH_TOKEN PAT was removed — the App installation health
  // is verified per-installation when the App is loaded from the DB.

  const claudeResult = await run('claude', ['--version']);
  if (claudeResult.code !== 0) {
    throw new Error(`claude --version failed: ${claudeResult.err.slice(0, 200)}`);
  }
  logger.info({ event: 'claude_cli_ok', version: claudeResult.out.trim() }, 'claude CLI available');

  // Spec 0044: github-mcp-server is the binary spawned by github-app-* connectors.
  // If the binary is missing, every github-app turn would fail with an opaque
  // ENOENT mid-conversation. Fail-fast at boot instead per spec §"Phase 7".
  // Spec 0072: dev environments that need to bypass this check select the
  // 'mock' backend via the runtime DB (E2E fixture seeds active_backend_id),
  // which routes around healthChecks entirely.
  const ghMcpResult = await run('github-mcp-server', ['--version']);
  if (ghMcpResult.code !== 0) {
    throw new Error(`github-mcp-server --version failed: ${ghMcpResult.err.slice(0, 200)}`);
  }
  logger.info(
    { event: 'github_mcp_server_ok', version: ghMcpResult.out.trim() },
    'github-mcp-server available',
  );

  // Spec 0071: Claude OAuth token is OPTIONAL at boot. The dashboard onboarding
  // surface will collect it; the worker stays graceful until it's set. The
  // CredentialsService check happens later in main() after the repo is built.
}

/**
 * Spec 0053 — resolve `agent/skills/` for the boot seeder. Mirrors the
 * candidate list used elsewhere (system-prompt, mcp, watcher): container
 * mount first (`/app/agent`), then repo-relative fallback for local dev.
 * Returns the absolute path even if the `skills/` dir doesn't exist; the
 * seeder tolerates a missing directory and reports zero defaults.
 */
function resolveAgentSkillsRoot(): string {
  const candidates = ['/app/agent', 'agent'];
  for (const base of candidates) {
    if (existsSync(base)) return `${base}/skills`;
  }
  return 'agent/skills';
}

/**
 * Spec 0053 — resolve `profile/skills/` for the boot seeder. `null` if no
 * profile is mounted. The mount point in Docker is `/app/profile`;
 * locally it's `profile/`.
 */
function resolveProfileSkillsRoot(): string | null {
  const candidates = ['/app/profile', 'profile'];
  for (const base of candidates) {
    if (existsSync(base)) return `${base}/skills`;
  }
  return null;
}

async function main(): Promise<void> {
  const config = loadConfig();
  // Bootstrap logger for pre-DB events. The real logger (with dbSink) is
  // created after the DB opens so retention + observability stay consistent.
  const bootLogger = createLogger({ service: 'worker' });
  bootLogger.info({ event: 'boot_start' }, 'Zeno booting');

  // Spec 0072: defer the claude-cli healthcheck until we know the active
  // backend slug from the runtime DB. The check moves below DB open.

  // Load identity files (SOUL.md from agent/, AGENTS.md from profile/).
  // Spec 2026-05-20 (agents-md-per-instance): the per-profile operating
  // manual lives at /app/profile/AGENTS.md. Shared baseline (SOUL.md)
  // stays at /app/agent/SOUL.md.
  const logKnowledgeEvent = (result: KnowledgeLoadResult): void => {
    const base = { bytes: result.content.length, fileCount: result.fileCount };
    switch (result.source) {
      case 'absent':
        bootLogger.info({ event: 'knowledge_dir_absent' }, 'knowledge dir not mounted');
        return;
      case 'index':
        bootLogger.info({ event: 'knowledge_index_loaded', ...base }, 'knowledge index loaded');
        break;
      case 'scan-missing':
        bootLogger.warn(
          { event: 'knowledge_index_missing', ...base },
          '_index.md missing; live-scanned knowledge',
        );
        break;
      case 'scan-stale':
        bootLogger.warn(
          {
            event: 'knowledge_index_stale',
            ...base,
            stalestMtime: result.stalestMtime,
          },
          '_index.md stale; live-scanned knowledge',
        );
        break;
    }
    if (result.truncated) {
      bootLogger.warn(
        {
          event: 'knowledge_index_truncated',
          originalBytes: result.originalBytes,
          droppedCount: result.droppedCount,
        },
        'knowledge block exceeded 8 KB cap',
      );
    }
  };

  const buildPromptNow = (): string => {
    const soul = loadAgentFile('SOUL.md');
    const agents = loadProfileFile('AGENTS.md');
    const knowledge = loadKnowledgeBlock();
    logKnowledgeEvent(knowledge);
    return buildSystemPrompt(soul, agents, knowledge.content || null);
  };

  const initialSoul = loadAgentFile('SOUL.md');
  const initialAgents = loadProfileFile('AGENTS.md');
  const initialKnowledge = loadKnowledgeBlock();
  logKnowledgeEvent(initialKnowledge);

  const promptHolder = {
    value: buildSystemPrompt(initialSoul, initialAgents, initialKnowledge.content || null),
  };

  const dbPath = join(config.workspaceDir, 'zeno.db');
  const opened = openRuntimeDatabase(dbPath);
  const db = opened.drizzle;
  bootLogger.info({ event: 'db_opened', path: dbPath }, 'database opened');

  // Spec 0062 boot steps 1 + 2: BEFORE migrations run, clean up any
  // partial-extract orphans in /workspace/skills/ AND move existing
  // dashboard bodies (and diverged profile bodies) from the DB to FS.
  // The pre-migration script is guarded by PRAGMA — it's a no-op if
  // skills.body has already been dropped (i.e., this image was deployed
  // once already).
  const dashboardSkillsRoot = join(config.workspaceDir, 'skills');
  const agentSkillsRoot = resolveAgentSkillsRoot();
  const profileSkillsRoot = resolveProfileSkillsRoot();
  // Spec 0062: ensure the dashboard volume root exists before anything else
  // touches it. The watcher's existsSync gate only runs at start-up; without
  // the dir present, watcher won't subscribe and dashboard zip-installs will
  // require a worker restart to fire hot-reload.
  await mkdir(dashboardSkillsRoot, { recursive: true });
  await cleanupTmpExtractDirs(dashboardSkillsRoot);
  preMigrateBodiesToFs({
    db: opened.raw,
    agentSkillsRoot,
    profileSkillsRoot: profileSkillsRoot ?? '/app/profile/skills',
    dashboardSkillsRoot,
    logger: bootLogger,
  });

  // Spec 0071: pre-migration backup of zeno.db. Idempotent — only writes the
  // first time. Operator can delete the .pre-0071-backup file after verifying
  // the new boot succeeds.
  const backupPath = `${dbPath}.pre-0071-backup`;
  if (!existsSync(backupPath) && existsSync(dbPath)) {
    const { copyFileSync } = await import('node:fs');
    copyFileSync(dbPath, backupPath);
    bootLogger.info({ event: 'db_backup_written', path: backupPath }, 'pre-0071 db backup written');
  }

  runRuntimeMigrations(opened.raw);
  bootLogger.info({ event: 'migrations_applied' }, 'migrations applied');

  // Spec 0071 retired: the new runtime schema has no plaintext value column,
  // so the legacy `migrateConnectorSecretsEncryption` data migration is gone.
  const profileId = process.env.ZENO_PROFILE ?? 'default';

  // Seed defaults for first-boot databases. Both seeders are idempotent:
  // INSERT OR IGNORE for capabilities, slug-existence-check for connectors.
  seedDefaultAgentCapabilities(db);
  seedDefaultConnectors(db);

  const sessions = new SessionRepo(db);
  const crons = new CronRepo(db);
  const cronRuns = new CronRunRepo(db);
  const commands = new CommandRepo(db);
  const logs = new LogRepo(db);
  const connectors = new ConnectorRepo(db, {
    masterKey: config.masterKey,
    profileId,
  });
  const backendCredentials = new BackendCredentialsRepo(db, {
    masterKey: config.masterKey,
    profileId,
  });
  const backendSettings = new BackendSettingsRepo(db, profileId);
  // Spec 0072: active backend now lives in the runtime DB (set by the CLI),
  // not in process.env.ZENO_BACKEND. Default 'claude-code' string literal so
  // a fresh profile boots into the only real driver.
  const activeBackendId = backendSettings.get('active_backend_id') ?? 'claude-code';
  bootLogger.info(
    { event: 'backend_active_resolved', backend: activeBackendId, source: 'runtime_db' },
    `active backend resolved: ${activeBackendId}`,
  );
  if (activeBackendId === 'claude-code') {
    await healthChecks(bootLogger, config);
  } else {
    bootLogger.info(
      { event: 'health_checks_skipped', backend: activeBackendId },
      'non-claude-code backend selected, skipping claude-cli healthcheck',
    );
  }
  const credentialsService = new CredentialsService({ repo: backendCredentials });

  /**
   * Spec 0071: per-call env provider for ClaudeCodeBackend. Reads the
   * encrypted token from DB on EACH query() call, hydrates the SDK env
   * exclusively for that call. The parent worker process NEVER sets
   * `process.env.CLAUDE_CODE_OAUTH_TOKEN` (per
   * `.vault/rules/integration-tokens-in-db-only.md`). Returns undefined when
   * no token is configured — the SDK then fails with auth error which the
   * channel adapter classifies into the user-facing "Claude is not
   * configured" reply.
   */
  const claudeEnvProvider = (): Record<string, string | undefined> | undefined => {
    const token = credentialsService.getActiveBackendToken({ backendId: 'claude-code' });
    return token ? { CLAUDE_CODE_OAUTH_TOKEN: token } : undefined;
  };

  const connectorApps = new ConnectorAppRepo(db);
  const skillRepo = new SkillRepo(db, {
    agentSkillsRoot,
    profileSkillsRoot: profileSkillsRoot ?? '/app/profile/skills',
    dashboardSkillsRoot,
  });
  const connectorSkillRepo = new ConnectorSkillRepo(db);
  const cronSkillRepo = new CronSkillRepo(db);
  const cronConnectorRepo = new CronConnectorRepo(db);
  const agentCapabilityRepo = new AgentCapabilityRepo(db);

  // Real logger now that the sink is available. Every log from here on is
  // persisted for the dashboard Logs page.
  const logger = createLogger({ service: 'worker', dbSink: logs });

  if (initialSoul) {
    logger.info({ event: 'soul_md_loaded', bytes: initialSoul.length }, 'SOUL.md loaded');
  }
  if (initialAgents) {
    logger.info({ event: 'agents_md_loaded', bytes: initialAgents.length }, 'AGENTS.md loaded');
  } else {
    logger.warn(
      { event: 'agents_md_missing' },
      'AGENTS.md not found — Zeno will run without per-instance operating manual',
    );
  }

  // Spec 0052: skills are content-only markdown playbooks materialized
  // from DB to ${claudeHome}/skills/<name>/SKILL.md. The Claude Agent SDK
  // auto-discovers them from there (Path A; see mcp-build.ts gate-zero
  // note). Boot-time materialization keeps DB ↔ FS in sync after any
  // crash recovery.
  //
  // Spec 0053: before materializing, run the seeder. It reads files
  // shipped with the binary (`agent/skills/`) and the active profile
  // (`profile/skills/`) and reconciles them into the DB:
  // `zeno_default` UPSERT (file is canonical), `profile` INSERT OR
  // IGNORE (operator-editable after first seed). Then the materializer
  // writes the resulting DB state to FS.
  const claudeHome = join(homedir(), '.claude');
  // Spec 0062: agentSkillsRoot, profileSkillsRoot, dashboardSkillsRoot are
  // resolved earlier (above the SkillRepo construction). Reuse them here.
  bootSkillsReconcile({
    skills: skillRepo,
    agentSkillsRoot,
    profileSkillsRoot,
    dashboardSkillsRoot,
    logger,
  });
  const initialMaterialize = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
  logger.info(
    { event: 'skills_loaded', count: initialMaterialize.written },
    `loaded ${initialMaterialize.written} skill(s) from DB`,
  );

  // Spec 0071: materialize ~/.claude/.credentials.json from DB at boot if a
  // token exists. The SDK reads this file at session start. The watcher (later)
  // keeps it in sync on credential change. If no token is configured, the
  // worker boots gracefully — turns reply with "Claude is not configured".
  const initialClaudeToken = credentialsService.getActiveBackendToken({
    backendId: 'claude-code',
  });
  if (initialClaudeToken) {
    await materializeClaudeCredentials({ claudeHome, oauthToken: initialClaudeToken });
    logger.info({ event: 'claude_backend_configured' }, 'Claude credential loaded from DB');
  } else {
    logger.info(
      { event: 'claude_backend_unconfigured' },
      'no Claude credential in DB; configure via dashboard /onboarding/connect-claude',
    );
  }
  const credentialsWatcher = new CredentialsWatcher({
    repo: backendCredentials,
    claudeHome,
    backendId: 'claude-code',
    logger,
  });
  credentialsWatcher.start();

  // Spec 0052: log the agent capability state at boot so operators can
  // diagnose tool denials by reading logs.
  const enabledCaps = agentCapabilityRepo
    .list()
    .filter((c) => c.enabled)
    .map((c) => c.toolName);
  logger.info(
    { event: 'agent_capabilities_loaded', enabled: enabledCaps },
    enabledCaps.length === 0
      ? 'agent capabilities all disabled — agent is connector-only until /settings is updated'
      : `agent capabilities enabled: ${enabledCaps.join(', ')}`,
  );

  // GitHub App auth — mints + caches installation tokens that the
  // `mcp__github-app-*` MCP tools consume directly from the cache.
  // Spec 0044: config + installations live in the connector_apps + connectors
  // tables. Spec 0051: the legacy `process.env[<ORG>_GH_TOKEN]` write was
  // removed (no consumers). The instance is mutable across the worker
  // lifetime; lifecycle commands call surgical mutations on this same
  // instance.
  const githubAppHolder: { value: GitHubAppAuth | null } = {
    value: await loadGitHubAppFromDb({ connectors, connectorApps: connectorApps }),
  };
  if (githubAppHolder.value) {
    await githubAppHolder.value.bootstrap();
  } else {
    logger.info(
      { event: 'github_app_skipped' },
      'no github_app installed yet — use the dashboard to install one',
    );
  }
  // Bootstrap helper called by the `app_install` handler when an App is
  // installed AFTER the worker booted (cold-start case). Keeps the singleton
  // pattern simple from the handlers' perspective.
  const bootstrapGithubApp = async (): Promise<GitHubAppAuth | null> => {
    if (githubAppHolder.value) return githubAppHolder.value;
    const app = await loadGitHubAppFromDb({ connectors, connectorApps });
    if (app) {
      await app.bootstrap();
      githubAppHolder.value = app;
    }
    return githubAppHolder.value;
  };
  // Tear-down helper for app_uninstall: call appUninstall() on the instance,
  // then drop the singleton so the worker resumes from null state.
  const tearDownGithubApp = (): void => {
    if (!githubAppHolder.value) return;
    githubAppHolder.value.appUninstall();
    githubAppHolder.value = null;
  };

  // The MCP map is built per agent turn from the DB so connector edits land
  // without restart. We resolve once at boot just for the log line.
  // Spec 0042: pass githubApp so buildMcpServersMap can intercept github-app-*
  // connectors and synthesize a fresh GITHUB_PERSONAL_ACCESS_TOKEN per turn.
  const getMcpServers = () =>
    buildMcpServersMap({ connectorRepo: connectors, githubApp: githubAppHolder.value, logger });
  const initialServers = getMcpServers();
  logger.info(
    {
      event: 'mcp_loaded',
      count: Object.keys(initialServers).length,
      servers: Object.keys(initialServers),
    },
    'mcp servers loaded',
  );

  // onInvocation handler — called from ClaudeCodeBackend after every tool
  // result. Records into connector_invocations + bumps last_verified_at on
  // success / last_error on transport failure. Spec 0032 P5.
  const onInvocation = (event: InvocationEvent): void => {
    try {
      const match = event.toolName.match(/^mcp__([a-z0-9][a-z0-9-]*)__/);
      if (!match) return;
      const slug = match[1];
      if (!slug) return;
      const connector = connectors.getBySlug(slug);
      if (!connector) return;
      const bareTool = event.toolName.slice(`mcp__${slug}__`.length);
      const now = new Date().toISOString();
      connectors.recordInvocation({
        connectorId: connector.id,
        toolName: bareTool,
        threadId: event.threadId,
        correlationId: event.correlationId,
        result: event.result,
        durationMs: event.durationMs,
        errorMessage: event.errorMessage,
      });
      if (event.result === 'ok') {
        connectors.update(connector.id, {
          lastVerifiedAt: now,
          lastError: null,
          lastErrorAt: null,
        });
      } else {
        connectors.update(connector.id, {
          lastError: (event.errorMessage ?? 'unknown error').slice(0, 500),
          lastErrorAt: now,
        });
      }
    } catch (err) {
      logger.error(
        { event: 'invocation_record_failed', err: String(err) },
        'failed to record connector invocation',
      );
    }
  };

  const gitIdentity = resolveGitIdentity();
  if (gitIdentity) {
    process.env.GIT_AUTHOR_NAME = gitIdentity.name;
    process.env.GIT_COMMITTER_NAME = gitIdentity.name;
    process.env.GIT_AUTHOR_EMAIL = gitIdentity.email;
    process.env.GIT_COMMITTER_EMAIL = gitIdentity.email;
  }

  // Spec 2026-05-11: ChannelManager owns every channel adapter (slack today,
  // discord/telegram/whatsapp tomorrow). It polls the DB every 2 s and reconciles
  // the running adapter set with the desired state — install / rotate / disable /
  // uninstall all land without restart. When zero channels are installed, the
  // manager's `getActiveChannel()` returns a `NoopChannel` singleton so the cron
  // runner + agent orchestrator have a stable Channel reference to call into.
  //
  // The cron runner and the inbound message handler hold the proxy returned by
  // `manager.asChannel()`; the proxy re-resolves to the live adapter on every
  // method call, so a rotation/restart never invalidates downstream references.
  const channelManager = new ChannelManager({
    repo: connectors,
    logger,
    buildAdapter: (row: ChannelRow) => {
      if (row.catalogId !== 'slack') {
        throw new Error(`no adapter registered for catalog '${row.catalogId}'`);
      }
      const secrets = connectors.getSecrets(row.id);
      const appToken = secrets.find((s) => s.key === 'SLACK_APP_TOKEN')?.value;
      const botToken = secrets.find((s) => s.key === 'SLACK_BOT_TOKEN')?.value;
      if (!appToken || !botToken) {
        throw new Error(`slack channel ${row.id} missing required secrets`);
      }
      return new SlackChannel({
        appToken,
        botToken,
        workspaceDir: config.workspaceDir,
      });
    },
  });
  const slack: Channel = channelManager.asChannel();

  const isClaudeBackend = activeBackendId === 'claude-code';
  const gatedDeps = {
    connectorRepo: connectors,
    agentCapabilityRepo,
    connectorSkillRepo,
    skillRepo, // Spec 0062: needed to resolve canonicalPath for FS body reads.
    logger,
  };

  // Spec 2026-05-22 (crons CLI-first): cron fires now flow through CronManager
  // → AgentBackend.query() with the cron's body as the user message and the
  // cron folder as cwd. The dedicated `backendForRunner` and the cron MCP
  // server were retired together; the cron backend now shares the chat
  // backend below (built immediately after) via a closure that the
  // CronManager captures.
  let backendForRunner: AgentBackend | null = null;

  const dispatcher = buildDispatcher(
    buildHandlerMap({
      connectors,
      connectorApps,
      exit: (code) => process.exit(code),
      // Spec 0044: pass getter so handlers observe the current value of the
      // (mutable) singleton. bootstrap/tearDown wired through the helpers above.
      getGithubApp: () => githubAppHolder.value,
      bootstrapGithubApp,
      tearDownGithubApp,
      // Spec 2026-05-22 (crons CLI-first): the cron_test handler needs the
      // chat backend. Built immediately below, so close over the binding.
      getCronBackend: () => backendForRunner,
    }),
  );

  const commandsPoller = new CommandsPoller({
    commandRepo: commands,
    dispatch: dispatcher,
    logger,
  });

  // Spec 0050: the only guardrail is the connector-permission gate.
  // Spec 2026-05-22: the chat backend no longer hosts the cron MCP server.
  // Cron CRUD is operator-only via the `zeno cron …` CLI surface.
  let chatBackend: AgentBackend;
  if (isClaudeBackend) {
    let chatOuterHook:
      | ((
          ...args: Parameters<ReturnType<ConnectorGatedBackend['buildPreToolUseHook']>>
        ) => ReturnType<ReturnType<ConnectorGatedBackend['buildPreToolUseHook']>>)
      | null = null;
    const chatLazyHook: ReturnType<ConnectorGatedBackend['buildPreToolUseHook']> = (
      ...args: Parameters<ReturnType<ConnectorGatedBackend['buildPreToolUseHook']>>
    ) => {
      if (!chatOuterHook) throw new Error('chat preToolUseHook not bound');
      return chatOuterHook(...args);
    };
    const gatedInner = new ClaudeCodeBackend({
      getMcpServers,
      preToolUseHook: chatLazyHook,
      onInvocation,
      envProvider: claudeEnvProvider,
    });
    const chatWrapper = new ConnectorGatedBackend(gatedInner, gatedDeps);
    chatOuterHook = chatWrapper.buildPreToolUseHook();
    chatBackend = chatWrapper;
    logger.info(
      { event: 'connector_gate_enabled' },
      'connector-permission gate enabled (spec 0050)',
    );
  } else {
    chatBackend = buildBackend(logger, activeBackendId, {
      getMcpServers,
      onInvocation,
      envProvider: claudeEnvProvider,
    });
    logger.warn(
      { event: 'connector_gate_skipped_non_claude_backend' },
      'connector-permission gate skipped: backend is not claude-code',
    );
  }
  backendForRunner = chatBackend;

  const core = new AgentCore({
    backend: chatBackend,
    workspaceDir: config.workspaceDir,
    getSystemPrompt: () => promptHolder.value,
    sessions,
    // Spec 0071: flip status='expired' so the dashboard sidebar dot turns
    // red on the next 30s polling tick. Future spec adds a Slack DM to the
    // operator (debounced via last_auth_alert_at).
    onAuthExpired: (backendId) => {
      backendCredentials.setStatus(backendId, 'expired', null);
      logger.warn(
        { event: 'backend_auth_expired_status_set', backendId },
        'set backend status=expired after auth_expired classification',
      );
    },
  });

  const watcher = new ProfileWatcher({
    onPromptFilesChanged: () => {
      promptHolder.value = buildPromptNow();
      logger.info(
        { event: 'system_prompt_reloaded', bytes: promptHolder.value.length },
        'system prompt reloaded',
      );
    },
    // Spec 0062: skill bucket watches /workspace/skills/ (dashboard volume)
    // AND fires on agent/skills/* + profile/skills/* (via classify rules
    // in watcher.ts). Each event re-runs the materializer so symlinks at
    // ${claudeHome}/skills/ stay in sync after deletes/installs/edits.
    // Wrapped in try/catch so a transient FS error doesn't kill the
    // watcher loop. The Claude Agent SDK auto-discovers from
    // ${claudeHome}/skills/ on every query (lazy), so the materializer
    // is the only piece needed in-band.
    onSkillsChanged: () => {
      void (async () => {
        try {
          const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
          logger.info(
            { event: 'skills_reloaded', written: result.written, deleted: result.deleted },
            'skills FS change detected; symlink farm re-materialized',
          );
          // Spec 0062 — watcher path frontmatter resync (safety net for
          // SSH-edits to SKILL.md that bypass the API). For each skill in
          // DB, re-parse SKILL.md frontmatter; UPDATE skills.description
          // if it differs from the row. Idempotent: if the API path already
          // synced, this is a no-op.
          for (const skill of skillRepo.list()) {
            try {
              const skillMd = await readFile(
                join(skillRepo.canonicalPath(skill), 'SKILL.md'),
                'utf8',
              );
              const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);
              if (!fmMatch) continue;
              const descLine = fmMatch[1]?.split('\n').find((l) => l.startsWith('description:'));
              if (!descLine) continue;
              const newDesc = descLine.replace(/^description:\s*/, '').trim();
              if (newDesc && newDesc !== skill.description) {
                skillRepo.update(skill.id, { description: newDesc });
                logger.info(
                  {
                    event: 'skill_description_resynced_from_fs',
                    skillId: skill.id,
                    name: skill.name,
                  },
                  `SSH-edit detected on ${skill.name}/SKILL.md — description resynced from FS`,
                );
              }
            } catch {
              // SKILL.md missing for this skill — happens transiently during
              // delete; let the next reconciler pass resolve it.
            }
          }
        } catch (err) {
          logger.warn(
            { event: 'skills_materialize_failed_on_watch', err: String(err) },
            'materializer threw on watcher event; SDK may see stale symlinks until next event',
          );
        }
      })();
    },
    onKnowledgeChanged: () => {
      promptHolder.value = buildPromptNow();
      logger.info(
        { event: 'system_prompt_reloaded_knowledge', bytes: promptHolder.value.length },
        'system prompt reloaded (knowledge)',
      );
    },
    dashboardSkillsPath: dashboardSkillsRoot,
  });

  // Spec 2026-05-11: ChannelManager.start() spawns every enabled channel adapter and
  // registers the agent core's message handler on each one. The `slack` Channel
  // reference above is the manager's proxy — it stays valid across restarts.
  await channelManager.start(core.bind(slack));

  // Spec 2026-05-22 (crons CLI-first): CronManager replaces the legacy
  // CronRunner. Reads /app/crons/*/CRON.md and fires each cron's body
  // through the chat backend at scheduled times.
  const cronManager = new CronManager({
    rootDir: '/app/crons',
    crons,
    cronRuns,
    fire: async (slug, body, cwd) => {
      if (!backendForRunner) {
        return { sessionId: null, status: 'failed', error: 'backend not initialized' };
      }
      try {
        const result = await backendForRunner.query({
          systemPrompt: promptHolder.value,
          userMessage: body,
          cwd,
          correlationId: `cron-${slug}-${Date.now()}`,
          persistSession: false,
        });
        return { sessionId: result.sessionId ?? null, status: 'success' };
      } catch (err) {
        return {
          sessionId: null,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    logger: logger.child({ scope: 'cron-manager' }),
  });
  await cronManager.start();

  commandsPoller.start();
  watcher.start();

  const logsRetention = new LogsRetention({
    logRepo: logs,
    retentionDays: config.logsRetentionDays,
    logger,
  });
  logsRetention.start();
  logger.info(
    { event: 'logs_retention_scheduled', retentionDays: config.logsRetentionDays },
    'logs retention scheduled',
  );

  logger.info({ event: 'zeno_online' }, 'Zeno online');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ event: 'shutdown', signal }, 'shutting down');
    try {
      watcher.stop();
    } catch {
      // best effort
    }
    try {
      await cronManager.stop();
    } catch {
      // best effort
    }
    try {
      logsRetention.stop();
    } catch {
      // best effort
    }
    try {
      commandsPoller.stop();
    } catch {
      // best effort
    }
    try {
      // Spec 0044 review F1: clear the GitHub App refresh interval so the
      // event loop drains cleanly. process.exit(0) below masks this in
      // practice, but graceful-drain code paths in the future will rely on it.
      githubAppHolder.value?.stop();
    } catch {
      // best effort
    }
    try {
      // Spec 2026-05-11: ChannelManager.stop cascades adapter.stop() across every running
      // adapter and clears the poll tick.
      await channelManager.stop();
    } catch {
      // best effort
    }
    try {
      logger.info({ event: 'db_closed' }, 'closing database');
      opened.close();
    } catch {
      // best effort
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  const fatalLogger = createLogger({ service: 'worker' });
  fatalLogger.fatal({ event: 'boot_failed', err: String(error) }, 'boot failed');
  process.exit(1);
});
