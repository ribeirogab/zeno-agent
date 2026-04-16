import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let profileDir: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  profileDir = mkdtempSync(join(tmpdir(), 'zeno-profile-'));
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    claudeHome: '/tmp',
    profileDir,
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/settings', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/settings');
    expect(res.status).toBe(401);
  });

  it('returns backend + mcp + profile files', async () => {
    writeFileSync(join(profileDir, 'SOUL.md'), '# Zeno');
    writeFileSync(join(profileDir, 'crons.yaml'), 'crons: []');
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { foo: { command: 'x' } } }),
    );
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      backend: { name: string };
      mcpServers: Array<{ name: string; status: string }>;
      profileFiles: Array<{ path: string }>;
    };
    expect(body.backend.name).toBe('claude-code');
    expect(body.mcpServers.some((server) => server.name === 'foo')).toBe(true);
    const paths = body.profileFiles.map((file) => file.path);
    expect(paths).toContain('SOUL.md');
    expect(paths).toContain('crons.yaml');
  });
});

describe('POST /api/settings/restart', () => {
  it('enqueues worker_restart', async () => {
    const res = await makeApp(db).request('/api/settings/restart', {
      method: 'POST',
      headers: authed(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('worker_restart');
  });
});
