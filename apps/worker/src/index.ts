import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createLogger, type Logger } from '@zeno/logger';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  closeDatabase,
  LogRepo,
  openDatabase,
  runMigrations,
  SessionRepo,
} from '@zeno/storage';
import { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import { MockBackend } from '@/agent/backends/mock';
import { loadMockFixtures } from '@/agent/backends/mock-fixtures';
import { AgentCore } from '@/agent/core';
import { loadMcpConfig, type McpServerConfig } from '@/agent/mcp';
import { buildSystemPrompt, loadAgentFile, loadProfileFile } from '@/agent/system-prompt';
import type { AgentBackend } from '@/agent/types';
import { SlackChannel } from '@/channels/slack/adapter';
import { buildDispatcher } from '@/commands/dispatcher';
import { buildHandlerMap } from '@/commands/handlers';
import { CommandsPoller } from '@/commands/poller';
import { type Config, loadConfig } from '@/config';
import { CronRunner } from '@/cron/runner';
import { loadStaticCrons } from '@/cron/static-loader';
import { buildCronMcpServer } from '@/cron/tools';
import { loadGitHubAppConfig } from '@/github/app-auth';
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
  mcpServers: Record<string, McpServerConfig>;
  // biome-ignore lint/suspicious/noExplicitAny: in-process MCP server type is not exported
  inProcessMcpServers?: Record<string, any>;
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
  const buildPromptNow = (): string => {
    const soul = loadAgentFile('SOUL.md');
    const user = loadProfileFile('USER.md');
    return buildSystemPrompt(soul, user);
  };

  const initialSoul = loadAgentFile('SOUL.md');
  const initialUser = loadProfileFile('USER.md');

  const promptHolder = { value: buildSystemPrompt(initialSoul, initialUser) };

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
  const githubApp = loadGitHubAppConfig();
  if (githubApp) {
    await githubApp.bootstrap();
  } else {
    logger.info(
      { event: 'github_app_skipped' },
      'no github_app section in config.yaml, using GH_TOKEN only',
    );
  }

  const mcpServers = loadMcpConfig();
  logger.info(
    {
      event: 'mcp_loaded',
      count: Object.keys(mcpServers).length,
      servers: Object.keys(mcpServers),
    },
    'mcp servers loaded',
  );

  const slack = new SlackChannel(config.slack);
  const defaultCronChannel = process.env.ZENO_CRON_DEFAULT_CHANNEL ?? null;

  // Build runner first so its `runOnce` is bound to the cron tools
  const backendForRunner = buildBackend(logger, { mcpServers });
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
      runner,
      exit: (code) => process.exit(code),
    }),
  );

  const commandsPoller = new CommandsPoller({
    commandRepo: commands,
    dispatch: dispatcher,
    logger,
  });

  // The chat-facing backend gets the in-process MCP server with cron CRUD tools wired to repos + runner
  const cronMcp = buildCronMcpServer({ crons, cronRuns, runner });
  const backend = buildBackend(logger, {
    mcpServers,
    inProcessMcpServers: { zeno: cronMcp },
  });
  const core = new AgentCore({
    backend,
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
    onMcpChanged: () => {
      logger.warn(
        { event: 'mcp_change_requires_restart' },
        'profile/mcp.json changed — restart Zeno to apply',
      );
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
