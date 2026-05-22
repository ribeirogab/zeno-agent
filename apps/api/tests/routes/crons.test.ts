import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CronTestRunner } from '@/routes/crons';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let cronsDir: string;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  cronsDir = mkdtempSync(join(tmpdir(), 'api-crons-'));
});

afterEach(() => {
  rmSync(cronsDir, { recursive: true, force: true });
});

function makeApp(
  database: RuntimeDB,
  opts: { writes?: 'cli' | 'dashboard'; runTest?: CronTestRunner } = {},
) {
  return createApp({
    config: {
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
      masterKey: Buffer.alloc(32),
      profileId: 'test',
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    claudeHome: '/tmp',
    profileDir: '/tmp',
    knowledgeRoot: '/tmp',
    cronsRootDir: cronsDir,
    ...(opts.writes !== undefined ? { writes: opts.writes } : {}),
    ...(opts.runTest ? { runCronTest: opts.runTest } : {}),
  });
}

function seedFolder(
  slug: string,
  frontmatter: Record<string, string | boolean>,
  body: string,
): void {
  const cdir = join(cronsDir, slug);
  mkdirSync(cdir, { recursive: true });
  const lines = [
    '---',
    ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`),
    '---',
    body,
    '',
  ];
  writeFileSync(join(cdir, 'CRON.md'), lines.join('\n'));
}

function seedDb(slug: string, opts: { enabled?: boolean } = {}): void {
  new CronRepo(db).upsertFromFile({
    slug,
    name: slug,
    description: null,
    schedule: '0 9 * * *',
    enabled: opts.enabled ?? true,
    contentHash: 'h',
    mtimeMs: 1,
    nextRunAt: null,
  });
}

describe('GET /api/crons', () => {
  it('returns empty list on empty db', async () => {
    const res = await makeApp(db).request('/api/crons', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns all crons (slim row shape)', async () => {
    seedDb('cron-a');
    seedDb('cron-b');
    const res = await makeApp(db).request('/api/crons', { headers: csrfHeaders() });
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(2);
    expect(body.map((r) => r.id).sort()).toEqual(['cron-a', 'cron-b']);
  });
});

describe('GET /api/crons/:slug', () => {
  it('returns cron + recent runs', async () => {
    seedDb('x');
    const runs = new CronRunRepo(db);
    const r = runs.start('x');
    runs.finish(r.id, 'success', { output: 'ok' });
    const res = await makeApp(db).request('/api/crons/x', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cron: { id: string };
      recentRuns: Array<{ id: string }>;
    };
    expect(body.cron.id).toBe('x');
    expect(body.recentRuns).toHaveLength(1);
  });

  it('returns 404 for unknown slug', async () => {
    const res = await makeApp(db).request('/api/crons/nope', { headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/crons/:slug/source', () => {
  it('returns raw CRON.md from disk', async () => {
    seedFolder('hello', { name: 'Hello', schedule: '0 9 * * *', enabled: true }, 'Say hello.');
    const res = await makeApp(db).request('/api/crons/hello/source', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { raw: string };
    expect(body.raw).toContain('name: Hello');
    expect(body.raw).toContain('Say hello.');
  });

  it('returns 404 when CRON.md is missing', async () => {
    const res = await makeApp(db).request('/api/crons/nope/source', { headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });

  it('rejects bad slugs', async () => {
    const res = await makeApp(db).request('/api/crons/BAD-SLUG/source', { headers: csrfHeaders() });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/crons/:slug/test', () => {
  it('returns 403 mode_cli_only when ZENO_API_WRITES=cli and origin is dashboard', async () => {
    seedFolder('x', { name: 'X', schedule: '* * * * *', enabled: true }, 'body');
    const runTest: CronTestRunner = async () => ({ sessionId: 'sess', status: 'success' });
    const res = await makeApp(db, { writes: 'cli', runTest }).request('/api/crons/x/test', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; action: string; cli: string };
    expect(body.error).toBe('mode_cli_only');
    expect(body.action).toBe('test');
    expect(body.cli).toBe('zeno cron test x');
  });

  it('bypasses gate and enqueues a cron_test command when X-Zeno-Origin: cli is set', async () => {
    seedFolder('x', { name: 'X', schedule: '* * * * *', enabled: true }, 'body');
    const res = await makeApp(db).request('/api/crons/x/test', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'x-zeno-origin': 'cli' },
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { correlationId: string };
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    const pending = new CommandRepo(db).claimPending(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe('cron_test');
    expect(pending[0]?.correlationId).toBe(body.correlationId);
  });

  it('returns 404 when CRON.md is missing', async () => {
    const res = await makeApp(db).request('/api/crons/missing/test', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'x-zeno-origin': 'cli' },
    });
    expect(res.status).toBe(404);
  });
});

describe('removed routes return 404', () => {
  it.each([
    ['POST', '/api/crons'],
    ['PATCH', '/api/crons/x'],
    ['DELETE', '/api/crons/x'],
    ['POST', '/api/crons/x/pause'],
    ['POST', '/api/crons/x/resume'],
    ['POST', '/api/crons/x/run-now'],
  ])('%s %s → 404', async (method, path) => {
    const res = await makeApp(db).request(path, { method, headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });
});
