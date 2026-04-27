import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createLogger, type Logger } from '@zeno/logger';
import {
  ApprovalRulesRepo,
  ApprovalsLogRepo,
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  closeDatabase,
  LogRepo,
  openDatabase,
  runMigrations,
  SessionRepo,
} from '@zeno/storage';
import { ClaudeCodeBackend, type InvocationEvent } from '@/agent/backends/claude-code';
import { MockBackend } from '@/agent/backends/mock';
import { loadMockFixtures } from '@/agent/backends/mock-fixtures';
import { AgentCore } from '@/agent/core';
import type { McpServerConfig } from '@/agent/mcp';
import { buildMcpServersMap } from '@/agent/mcp-build';
import {
  buildSystemPrompt,
  loadAgentFile,
  loadAlwaysActiveSkills,
  loadProfileFile,
} from '@/agent/system-prompt';
import type { AgentBackend } from '@/agent/types';
import { SlackChannel } from '@/channels/slack/adapter';
import { buildDispatcher } from '@/commands/dispatcher';
import { buildHandlerMap } from '@/commands/handlers';
import { CommandsPoller } from '@/commands/poller';
import { type Config, loadConfig } from '@/config';
import { loadAlwaysActiveSkillNames } from '@/config/always-active-skills';
import { CronRunner } from '@/cron/runner';
import { loadStaticCrons } from '@/cron/static-loader';
import { buildCronMcpServer } from '@/cron/tools';
import { type GitHubAppAuth, loadGitHubAppFromDb } from '@/github/app-auth';
import { resolveGitIdentity } from '@/github/git-identity';
import { SlackApprover } from '@/guardrails/approver/slack-approver';
import { HaikuClassifier } from '@/guardrails/classifier/haiku';
import { loadApprovalsConfig } from '@/guardrails/config';
import { GuardedBackend } from '@/guardrails/guarded-backend';
import { migrateYamlAlwaysSensitiveToDb } from '@/guardrails/migration-yaml-to-db';
import { makeAlwaysAllowedPolicy } from '@/guardrails/policies/always-allowed';
import { makeAlwaysSensitivePolicy } from '@/guardrails/policies/always-sensitive';
import { makeAuditLogger } from '@/guardrails/policies/audit';
import { makeClassifierGatePolicy } from '@/guardrails/policies/classifier-gate';
import { makeConnectorPermissionPolicy } from '@/guardrails/policies/connector-permission';
import { makeReadOnlySkillPolicy } from '@/guardrails/policies/read-only-skill';
import { loadSkillRegistry } from '@/guardrails/skill-registry';
import type { PolicyMiddleware } from '@/guardrails/types';
import { LogsRetention } from '@/logs/retention';
import { ProfileWatcher } from '@/profile/watcher';

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
}

/**
 * Pick the agent backend based on ZENO_BACKEND. Default is the real Claude SDK; 'mock' is for dev/tests.
 * Throws on unknown values so a typo never silently degrades to a mock in prod.
 */
function buildBackend(logger: Logger, opts: BackendBuildOptions): AgentBackend {
  const choice = process.env.ZENO_BACKEND ?? 'claude-code';
  switch (choice) {
    case 'claude-code':
      logger.info({ event: 'backend_selected', backend: 'claude-code' }, 'using ClaudeCodeBackend');
      return new ClaudeCodeBackend(opts);
    case 'mock':
      logger.info({ event: 'backend_selected', backend: 'mock' }, 'using MockBackend');
      return new MockBackend(loadMockFixtures());
    default:
      throw new Error(`Unknown ZENO_BACKEND='${choice}' (expected 'claude-code' or 'mock')`);
  }
}

async function healthChecks(logger: Logger, config: Config): Promise<void> {
  const ghResult = await run('gh', ['auth', 'status'], { GH_TOKEN: config.github.token });
  if (ghResult.code !== 0) {
    throw new Error(`gh auth failed: ${ghResult.err.slice(0, 200)}`);
  }
  logger.info({ event: 'github_auth_ok' }, 'gh CLI authenticated');

  const claudeResult = await run('claude', ['--version']);
  if (claudeResult.code !== 0) {
    throw new Error(`claude --version failed: ${claudeResult.err.slice(0, 200)}`);
  }
  logger.info({ event: 'claude_cli_ok', version: claudeResult.out.trim() }, 'claude CLI available');

  // Spec 0044: github-mcp-server is the binary spawned by github-app-* connectors.
  // If the binary is missing, every github-app turn would fail with an opaque
  // ENOENT mid-conversation. Fail-fast at boot instead per spec §"Phase 7".
  // Dev environments that don't need github-app can run with ZENO_BACKEND=mock,
  // which already skips healthChecks entirely (line above).
  const ghMcpResult = await run('github-mcp-server', ['--version']);
  if (ghMcpResult.code !== 0) {
    throw new Error(`github-mcp-server --version failed: ${ghMcpResult.err.slice(0, 200)}`);
  }
  logger.info(
    { event: 'github_mcp_server_ok', version: ghMcpResult.out.trim() },
    'github-mcp-server available',
  );

  logger.info({ event: 'claude_oauth_token_present' }, 'Claude OAuth token configured');
}

async function main(): Promise<void> {
  const config = loadConfig();
  // Bootstrap logger for pre-DB events. The real logger (with dbSink) is
  // created after the DB opens so retention + observability stay consistent.
  const bootLogger = createLogger({ service: 'worker' });
  bootLogger.info({ event: 'boot_start' }, 'Zeno booting');

  if ((process.env.ZENO_BACKEND ?? 'claude-code') === 'claude-code') {
    await healthChecks(bootLogger, config);
  } else {
    bootLogger.info(
      { event: 'health_checks_skipped' },
      'mock backend selected, skipping CLI checks',
    );
  }

  // Load identity files (SOUL.md from agent/, USER.md from profile/)
  // + always-active skills from config
  const alwaysActiveNames = loadAlwaysActiveSkillNames();
  const alwaysActiveContents = loadAlwaysActiveSkills(alwaysActiveNames);

  const buildPromptNow = (): string => {
    const soul = loadAgentFile('SOUL.md');
    const user = loadProfileFile('USER.md');
    return buildSystemPrompt(soul, user, alwaysActiveContents);
  };

  const initialSoul = loadAgentFile('SOUL.md');
  const initialUser = loadProfileFile('USER.md');

  const promptHolder = { value: buildSystemPrompt(initialSoul, initialUser, alwaysActiveContents) };

  const dbPath = join(config.workspaceDir, 'zeno.db');
  const db = openDatabase(dbPath);
  bootLogger.info({ event: 'db_opened', path: dbPath }, 'database opened');
  runMigrations(db);
  bootLogger.info({ event: 'migrations_applied' }, 'migrations applied');
  const sessions = new SessionRepo(db);
  const crons = new CronRepo(db);
  const cronRuns = new CronRunRepo(db);
  const commands = new CommandRepo(db);
  const logs = new LogRepo(db);
  const approvalsLog = new ApprovalsLogRepo(db);
  const connectors = new ConnectorRepo(db);
  const connectorApps = new ConnectorAppRepo(db);
  const approvalRules = new ApprovalRulesRepo(db);

  // Real logger now that the sink is available. Every log from here on is
  // persisted for the dashboard Logs page.
  const logger = createLogger({ service: 'worker', dbSink: logs });

  if (initialSoul) {
    logger.info({ event: 'soul_md_loaded', bytes: initialSoul.length }, 'SOUL.md loaded');
  }
  if (initialUser) {
    logger.info({ event: 'user_md_loaded', bytes: initialUser.length }, 'USER.md loaded');
  } else {
    logger.warn(
      { event: 'user_md_missing' },
      'USER.md not found — Zeno will run without user-specific context',
    );
  }

  // Static crons are the source of truth in profile/config.yaml — replace on every boot.
  const staticCrons = loadStaticCrons();
  crons.replaceStaticSet(staticCrons);
  logger.info({ event: 'cron_static_loaded', count: staticCrons.length }, 'static crons loaded');

  // GitHub App auth — generates installation tokens and sets env vars (ACME_GH_TOKEN, etc.)
  // Spec 0044: read from connector_apps + connectors tables.
  // The instance is mutable across the worker lifetime; lifecycle commands
  // call the surgical mutations on this same instance.
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

  const approvalsConfig = loadApprovalsConfig();
  // Spec 0048 Q5: yaml `always_sensitive` is no longer parsed (loadApprovalsConfig
  // throws if the field is still present). The 0047 migration helper is kept
  // as a no-op safety net for any deployment that ran 0047 but didn't
  // complete the boot migration before 0048 shipped.
  void migrateYamlAlwaysSensitiveToDb;
  const slack = new SlackChannel({
    ...config.slack,
    dmOwnerUserId:
      approvalsConfig?.dm_owner_only !== false ? approvalsConfig?.owner_slack_user_id : undefined,
    workspaceDir: config.workspaceDir,
  });
  const defaultCronChannel = process.env.ZENO_CRON_DEFAULT_CHANNEL ?? null;

  // Build runner first so its `runOnce` is bound to the cron tools
  const backendForRunner = buildBackend(logger, { getMcpServers, onInvocation });
  const runner = new CronRunner({
    crons,
    cronRuns,
    backend: backendForRunner,
    getSystemPrompt: () => promptHolder.value,
    workspaceDir: config.workspaceDir,
    channel: slack,
    defaultConversationId: defaultCronChannel,
  });

  const dispatcher = buildDispatcher(
    buildHandlerMap({
      crons,
      cronRuns,
      connectors,
      connectorApps,
      approvalRules,
      runner,
      exit: (code) => process.exit(code),
      // Spec 0044: pass getter so handlers observe the current value of the
      // (mutable) singleton. bootstrap/tearDown wired through the helpers above.
      getGithubApp: () => githubAppHolder.value,
      bootstrapGithubApp,
      tearDownGithubApp,
    }),
  );

  const commandsPoller = new CommandsPoller({
    commandRepo: commands,
    dispatch: dispatcher,
    logger,
  });

  // The chat-facing backend gets the in-process MCP server with cron CRUD tools wired to repos + runner.
  // Crons run UNGUARDED for MVP (their `userMessage` carries no Slack context to identify a requester);
  // only this user-facing backend is wrapped with the guardrails policy pipeline.
  const cronMcp = buildCronMcpServer({ crons, cronRuns, runner });
  const isClaudeBackend = (process.env.ZENO_BACKEND ?? 'claude-code') === 'claude-code';

  let chatBackend: AgentBackend;
  if (approvalsConfig && isClaudeBackend) {
    const skillRegistry = loadSkillRegistry();
    const classifier = new HaikuClassifier({ model: approvalsConfig.classifier_model });
    const approver = new SlackApprover(
      slack,
      approvalsConfig.owner_slack_user_id,
      approvalsConfig.approval_timeout_sec * 1000,
    );
    const audit = makeAuditLogger(approvalsLog);
    const policies: PolicyMiddleware[] = [
      // Spec 0047: rules sourced from DB (mutable via dashboard); the getter
      // is called fresh per check so changes propagate to the next agent
      // turn without restart. Yaml `always_sensitive` is migrated to DB at
      // boot (above) and only read once per turn from DB after that.
      makeAlwaysSensitivePolicy({ getRules: () => approvalRules.listPatterns() }),
      makeAlwaysAllowedPolicy({
        tools: approvalsConfig.always_allowed_tools,
        commands: approvalsConfig.always_allowed_commands,
      }),
      makeReadOnlySkillPolicy(),
      makeConnectorPermissionPolicy({ connectorRepo: connectors }),
      makeClassifierGatePolicy(classifier),
    ];
    const guardedDeps = {
      policies,
      audit,
      approver,
      skillRegistry,
      ownerUserId: approvalsConfig.owner_slack_user_id,
      profile: process.env.PROFILE ?? 'default',
    };
    // Two-phase construction: the SDK's PreToolUse hook is a constructor option
    // on `ClaudeCodeBackend`, but the hook is owned by `GuardedBackend`. Build a
    // throwaway wrapper to obtain the hook, construct the real inner backend
    // with it, then build the final wrapper around it.
    const tempInner = new ClaudeCodeBackend({
      getMcpServers,
      inProcessMcpServers: { zeno: cronMcp },
    });
    const preToolUseHook = new GuardedBackend(tempInner, guardedDeps).buildPreToolUseHook();
    const guardedInner = new ClaudeCodeBackend({
      getMcpServers,
      inProcessMcpServers: { zeno: cronMcp },
      preToolUseHook,
      onInvocation,
    });
    chatBackend = new GuardedBackend(guardedInner, guardedDeps);
    logger.info(
      {
        event: 'guardrails_enabled',
        ownerUserId: approvalsConfig.owner_slack_user_id,
        // Spec 0048 Q5: rules now sourced from DB; report current count.
        alwaysSensitive: approvalRules.count(),
        timeoutSec: approvalsConfig.approval_timeout_sec,
      },
      'guardrails enabled',
    );
  } else {
    chatBackend = buildBackend(logger, {
      getMcpServers,
      inProcessMcpServers: { zeno: cronMcp },
      onInvocation,
    });
    if (approvalsConfig && !isClaudeBackend) {
      logger.warn(
        { event: 'guardrails_skipped_non_claude_backend' },
        'guardrails skipped: backend is not claude-code',
      );
    } else {
      logger.warn(
        { event: 'guardrails_disabled' },
        'approvals section missing in config — running unguarded',
      );
    }
  }

  const core = new AgentCore({
    backend: chatBackend,
    workspaceDir: config.workspaceDir,
    getSystemPrompt: () => promptHolder.value,
    sessions,
  });

  const watcher = new ProfileWatcher({
    onPromptFilesChanged: () => {
      promptHolder.value = buildPromptNow();
      logger.info(
        { event: 'system_prompt_reloaded', bytes: promptHolder.value.length },
        'system prompt reloaded',
      );
    },
    onCronsChanged: () => {
      const next = loadStaticCrons();
      crons.replaceStaticSet(next);
      logger.info({ event: 'static_crons_reloaded', count: next.length }, 'static crons reloaded');
    },
  });

  await slack.start(core.bind(slack));
  runner.start();
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
      runner.stop();
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
      await slack.stop();
    } catch {
      // best effort
    }
    try {
      logger.info({ event: 'db_closed' }, 'closing database');
      closeDatabase(db);
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
