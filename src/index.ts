import { spawn } from 'node:child_process';
import { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import { AgentCore } from '@/agent/core';
import { buildSystemPrompt, loadProfileFile } from '@/agent/system-prompt';
import { SlackChannel } from '@/channels/slack/adapter';
import { type Config, loadConfig } from '@/config';
import { logger } from '@/logger';

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

  const backend = new ClaudeCodeBackend();
  const core = new AgentCore({ backend, workspaceDir: config.workspaceDir, systemPrompt });

  const slack = new SlackChannel(config.slack);
  await slack.start(core.bind(slack));

  logger.info({ event: 'zeno_online' }, 'Zeno online');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ event: 'shutdown', signal }, 'shutting down');
    try {
      await slack.stop();
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
