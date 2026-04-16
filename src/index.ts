import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import { AgentCore } from '@/agent/core';
import { loadMcpConfig } from '@/agent/mcp';
import { buildSystemPrompt, loadProfileFile } from '@/agent/system-prompt';
import { SlackChannel } from '@/channels/slack/adapter';
import { type Config, loadConfig } from '@/config';
import { CronRunner } from '@/cron/runner';
import { loadStaticCrons } from '@/cron/static-loader';
import { buildCronMcpServer } from '@/cron/tools';
import { logger } from '@/logger';
import { closeDatabase, openDatabase } from '@/storage/db';
import { runMigrations } from '@/storage/migrations';
import { CronRunRepo } from '@/storage/repos/cron-runs';
import { CronRepo } from '@/storage/repos/crons';
import { SessionRepo } from '@/storage/repos/sessions';

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

async function healthChecks(config: Config): Promise<void> {
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
  logger.info({ event: 'boot_start' }, 'Zeno booting');

  await healthChecks(config);

  // Load profile files (SOUL.md = agent identity, USER.md = user profile)
  const soulMd = loadProfileFile('SOUL.md');
  if (soulMd) {
    logger.info({ event: 'soul_md_loaded', bytes: soulMd.length }, 'SOUL.md loaded');
  }

  const userMd = loadProfileFile('USER.md');
  if (userMd) {
    logger.info({ event: 'user_md_loaded', bytes: userMd.length }, 'USER.md loaded');
  } else {
    logger.warn(
      { event: 'user_md_missing' },
      'USER.md not found — Zeno will run without user-specific context',
    );
  }

  const systemPrompt = buildSystemPrompt(soulMd, userMd);

  const dbPath = join(config.workspaceDir, 'zeno.db');
  const db = openDatabase(dbPath);
  runMigrations(db);
  const sessions = new SessionRepo(db);
  const crons = new CronRepo(db);
  const cronRuns = new CronRunRepo(db);

  // Static crons are the source of truth in profile/crons.yaml — replace on every boot.
  const staticCrons = loadStaticCrons();
  crons.replaceStaticSet(staticCrons);
  logger.info({ event: 'cron_static_loaded', count: staticCrons.length }, 'static crons loaded');

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
  const backendForRunner = new ClaudeCodeBackend({ mcpServers });
  const runner = new CronRunner({
    crons,
    cronRuns,
    backend: backendForRunner,
    systemPrompt,
    workspaceDir: config.workspaceDir,
    channel: slack,
    defaultConversationId: defaultCronChannel,
  });

  // The chat-facing backend gets the in-process MCP server with cron CRUD tools wired to repos + runner
  const cronMcp = buildCronMcpServer({ crons, cronRuns, runner });
  const backend = new ClaudeCodeBackend({
    mcpServers,
    inProcessMcpServers: { zeno: cronMcp },
  });
  const core = new AgentCore({
    backend,
    workspaceDir: config.workspaceDir,
    systemPrompt,
    sessions,
  });

  await slack.start(core.bind(slack));
  runner.start();

  logger.info({ event: 'zeno_online' }, 'Zeno online');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ event: 'shutdown', signal }, 'shutting down');
    try {
      runner.stop();
    } catch {
      // best effort
    }
    try {
      await slack.stop();
    } catch {
      // best effort
    }
    try {
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
  logger.fatal({ event: 'boot_failed', err: String(error) }, 'boot failed');
  process.exit(1);
});
