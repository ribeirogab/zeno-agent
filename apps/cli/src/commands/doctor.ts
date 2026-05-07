import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import { composeFileExists } from '../lib/compose.js';
import { buildContext } from '../lib/context.js';

interface CheckResult {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
}

function dockerDaemonReachable(): CheckResult {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return { name: 'docker daemon reachable', ok: r.status === 0 };
}

function homeExists(home: string): CheckResult {
  return { name: `$ZENO_HOME exists (${home})`, ok: existsSync(home) };
}

function composeExists(home: string, profile: string): CheckResult {
  return {
    name: `compose file for profile '${profile}' exists`,
    ok: composeFileExists(home, profile),
    detail: `infra/docker-compose.${profile}.yml`,
  };
}

function envExists(home: string, profile: string): CheckResult {
  const path = join(home, 'profiles', profile, '.env');
  return {
    name: `profile '${profile}' .env exists`,
    ok: existsSync(path),
    detail: path,
  };
}

function containerRunning(home: string, profile: string): CheckResult {
  const r = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      `infra/docker-compose.${profile}.yml`,
      '--project-directory',
      home,
      'ps',
      '--quiet',
      '--status',
      'running',
    ],
    { encoding: 'utf8' },
  );
  const ids = (r.stdout ?? '').trim().split(/\s+/).filter(Boolean);
  return { name: 'agent container running', ok: ids.length > 0 };
}

function dashboardReachable(): Promise<CheckResult> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port: 3000 });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve({ name: 'dashboard port 3000 reachable', ok: false });
    }, 1000);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve({ name: 'dashboard port 3000 reachable', ok: true });
    });
    sock.on('error', () => {
      clearTimeout(timer);
      resolve({ name: 'dashboard port 3000 reachable', ok: false });
    });
  });
}

export default defineCommand({
  meta: { name: 'doctor', description: 'preflight diagnostics' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  async run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    const checks: CheckResult[] = [];
    checks.push(dockerDaemonReachable());
    checks.push(homeExists(ctx.home));
    checks.push(composeExists(ctx.home, ctx.profile.name));
    checks.push(envExists(ctx.home, ctx.profile.name));

    const running = containerRunning(ctx.home, ctx.profile.name);
    checks.push(running);
    if (running.ok) {
      checks.push(await dashboardReachable());
    } else {
      checks.push({
        name: 'dashboard port 3000 reachable',
        ok: true,
        skipped: true,
        detail: 'agent not running',
      });
    }

    let failed = false;
    for (const c of checks) {
      const mark = c.skipped ? '○' : c.ok ? '✓' : '✗';
      const tail = c.detail ? `  (${c.detail})` : '';
      const note = c.skipped ? ' [skipped]' : '';
      console.log(`${mark} ${c.name}${note}${tail}`);
      if (!c.ok && !c.skipped) failed = true;
    }
    process.exit(failed ? 1 : 0);
  },
});
