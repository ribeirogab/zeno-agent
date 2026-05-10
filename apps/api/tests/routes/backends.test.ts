import { resolve } from 'node:path';
import { _resetBackendsCatalogCache } from '@zeno/backends';
import {
  BackendCredentialsRepo,
  BackendSettingsRepo,
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

// Same trick as channels.test.ts — run from worktree root so the catalog
// loader's CWD-relative search finds agent/backends-catalog.json.
const ORIGINAL_CWD = process.cwd();
const WORKTREE_ROOT = resolve(__dirname, '../../../..');
beforeAll(() => process.chdir(WORKTREE_ROOT));
afterAll(() => process.chdir(ORIGINAL_CWD));

const MASTER_KEY = Buffer.from('a'.repeat(64), 'hex');

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  _resetBackendsCatalogCache();
});

interface AppOpts {
  fetchImpl?: typeof fetch;
}

function makeApp(database: RuntimeDB, opts: AppOpts = {}) {
  return createApp({
    config: {
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
      masterKey: MASTER_KEY,
      profileId: 'test',
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    backendCredentialsRepo: new BackendCredentialsRepo(database, {
      masterKey: MASTER_KEY,
      profileId: 'test',
    }),
    backendSettingsRepo: new BackendSettingsRepo(database, 'test'),
    claudeHome: '/tmp',
    profileDir: '/tmp',
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
}

describe('GET /api/backends (spec 0071)', () => {
  it('lists catalog backends merged with status (defaults to not_configured)', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/backends', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { active_backend_id: string | null; backends: unknown[] };
    expect(Array.isArray(body.backends)).toBe(true);
    const claude = (body.backends as Array<Record<string, unknown>>).find(
      (b) => b.id === 'claude-code',
    );
    expect(claude).toBeDefined();
    expect(claude?.status).toBe('not_configured');
    expect(claude?.last_tested_at).toBeNull();
    // Active selector defaults to the first catalog entry when nothing is set.
    expect(body.active_backend_id).toBe('claude-code');
  });

  it('NEVER returns the encrypted token / iv / value in any field', async () => {
    const repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'test' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-secret' });
    const app = makeApp(db);
    const res = await app.request('/api/backends', { headers: csrfHeaders() });
    const text = await res.text();
    expect(text).not.toMatch(/sk-ant-secret/);
    expect(text).not.toMatch(/value_encrypted/);
    expect(text).not.toMatch(/"iv"/);
  });
});

describe('POST /api/backends/:id/credentials (paste-token, spec 0071)', () => {
  it('rejects with invalid_format when regex fails', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/backends/claude-code/credentials', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-real-token' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_format');
  });

  it('returns 401 unauthorized when Anthropic rejects (and does NOT save)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 401 }),
    ) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const res = await app.request('/api/backends/claude-code/credentials', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'sk-ant-oat01-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
    });
    expect(res.status).toBe(401);
    // Verify NOT saved
    const repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'test' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBeNull();
  });

  it('returns 429 rate_limited (with retryAfterSec) and does NOT save', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } }),
    ) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const res = await app.request('/api/backends/claude-code/credentials', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'sk-ant-oat01-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterSec?: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSec).toBe(30);
  });

  it('saves with status=active when Anthropic returns ok', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"ok":true}', { status: 200 }),
    ) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const token = 'sk-ant-oat01-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const res = await app.request('/api/backends/claude-code/credentials', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body).toEqual({ ok: true, status: 'active' });

    const repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'test' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBe(token);
    expect(repo.listStatuses()[0]?.status).toBe('active');
  });

  it('saves with status=untested on network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const token = 'sk-ant-oat01-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const res = await app.request('/api/backends/claude-code/credentials', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body.status).toBe('untested');
  });
});

describe('PUT /api/backends/active (spec 0071)', () => {
  it('sets active_backend_id', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/backends/active', {
      method: 'PUT',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ backend_id: 'claude-code' }),
    });
    expect(res.status).toBe(200);
    const settings = new BackendSettingsRepo(db, 'test');
    expect(settings.get('active_backend_id')).toBe('claude-code');
  });

  it('rejects unknown backend_id', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/backends/active', {
      method: 'PUT',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ backend_id: 'not-a-backend' }),
    });
    expect(res.status).toBe(400);
  });
});
