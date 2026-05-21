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
    knowledgeRoot: '/tmp',
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

// Spec 0072 — POST /api/backends/:id/credentials, /oauth/start, /oauth/:s/input,
// /oauth/:s/stream, /oauth/:s/cancel, and PUT /api/backends/active are all
// deleted (CLI-only mutation surface). The previous test cases are gone.

describe('POST /api/backends/:id/test (spec 0072)', () => {
  it('returns 400 not_configured when no credential is stored', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/backends/claude-code/test', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_configured');
  });

  it('flips status to active on a successful Anthropic ping', async () => {
    const repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'test' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-secret' });

    const fetchImpl = vi.fn(
      async () => new Response('{"ok":true}', { status: 200 }),
    ) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const res = await app.request('/api/backends/claude-code/test', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string; kind: string };
    expect(body).toMatchObject({ ok: true, status: 'active', kind: 'ok' });
    expect(repo.listStatuses()[0]?.status).toBe('active');
  });

  it('flips status to expired on 401 unauthorized', async () => {
    const repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'test' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-secret' });

    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 401 }),
    ) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const res = await app.request('/api/backends/claude-code/test', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; kind: string };
    expect(body.status).toBe('expired');
    expect(body.kind).toBe('unauthorized');
  });

  it('flips status to untested on network error', async () => {
    const repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'test' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-secret' });

    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const app = makeApp(db, { fetchImpl });
    const res = await app.request('/api/backends/claude-code/test', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; kind: string };
    expect(body.status).toBe('untested');
    expect(body.kind).toBe('network');
  });
});
