/**
 * Integration tests for /api/connectors/catalog/github-app/*. Spec 0044.
 *
 * Mock fetch is hoisted via vi.stubGlobal so every endpoint exercised here
 * sees the same fake GitHub API.
 */

import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import {
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

function newPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let mockFetch: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
// catalog-loader resolves agent/connectors-catalog.json relative to cwd; chdir
// to repo root so findCatalogEntry('github-app') succeeds.
const repoRoot = resolve(__dirname, '..', '..', '..', '..');

beforeAll(() => {
  process.chdir(repoRoot);
});
afterAll(() => {
  process.chdir(originalCwd);
});

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  opened.close();
});

function makeApp() {
  return createApp({
    config: {
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
      masterKey: Buffer.alloc(32),
      profileId: 'test',
    },
    db,
    cronRepo: new CronRepo(db),
    cronRunRepo: new CronRunRepo(db),
    commandRepo: new CommandRepo(db),
    logRepo: new LogRepo(db),
    connectorRepo: new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    }),
    connectorAppRepo: new ConnectorAppRepo(db),
    claudeHome: '/tmp',
    profileDir: '/tmp',
    writes: 'dashboard',
  });
}

function fakeOk<T>(body: T, headers?: Record<string, string>) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: { get: (n: string) => headers?.[n.toLowerCase()] ?? null },
  });
}

function fakeErr(status: number, body = 'err') {
  return Promise.resolve({
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  });
}

describe('POST /api/connectors/catalog/github-app/test', () => {
  it('returns ok=true with appName + installations on success', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) {
        return fakeOk({ id: 12345, slug: 'zeno-bot', name: 'Zeno Bot' });
      }
      if (url.includes('/app/installations')) {
        return fakeOk([
          {
            id: 100,
            account: { login: 'acme', type: 'Organization' },
            permissions: { contents: 'read' },
            repository_selection: 'selected',
          },
        ]);
      }
      return fakeErr(404);
    });

    const pem = newPem();
    const res = await makeApp().request('/api/connectors/catalog/github-app/test', {
      method: 'POST',
      body: JSON.stringify({ appId: '12345', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      appName: string;
      installationsAvailable: Array<{ name: string; id: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.appName).toBe('Zeno Bot');
    expect(body.installationsAvailable).toHaveLength(1);
    expect(body.installationsAvailable[0]?.name).toBe('acme');
  });

  it('returns ok=false errorKind=auth on 401', async () => {
    mockFetch.mockImplementation(() => fakeErr(401, 'Bad credentials'));
    const pem = newPem();
    const res = await makeApp().request('/api/connectors/catalog/github-app/test', {
      method: 'POST',
      body: JSON.stringify({ appId: '12345', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; errorKind: string };
    expect(body.ok).toBe(false);
    expect(body.errorKind).toBe('auth');
  });

  it('returns ok=false on appId mismatch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) return fakeOk({ id: 999, slug: 'other', name: 'Other' });
      return fakeErr(404);
    });
    const pem = newPem();
    const res = await makeApp().request('/api/connectors/catalog/github-app/test', {
      method: 'POST',
      body: JSON.stringify({ appId: '12345', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/mismatch/);
  });

  it('rejects malformed PEM with shape error', async () => {
    const res = await makeApp().request('/api/connectors/catalog/github-app/test', {
      method: 'POST',
      body: JSON.stringify({ appId: '12345', pem: 'not-a-pem' }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    // zod refine fails → 400 from zValidator
    expect(res.status).toBe(400);
  });
});

describe('POST /api/connectors/catalog/github-app/install', () => {
  it('writes a connector_apps row + enqueues app_install', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) return fakeOk({ id: 7777, slug: 'zen', name: 'Zen' });
      return fakeErr(404);
    });
    const pem = newPem();
    const res = await makeApp().request('/api/connectors/catalog/github-app/install', {
      method: 'POST',
      body: JSON.stringify({ appId: '7777', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; appUuid: string; appName: string };
    expect(body.ok).toBe(true);
    expect(body.appName).toBe('Zen');
    expect(body.appUuid).toMatch(/[0-9a-f-]{36}/);

    // Row was created.
    const repo = new ConnectorAppRepo(db);
    const row = repo.getOneByCatalog('github-app');
    expect(row?.appId).toBe('7777');
    expect(row?.appName).toBe('Zen');
    expect(row?.pem).toBe(pem);
    expect(row?.pemSha256).toMatch(/^[a-f0-9]{64}$/);

    // Command was enqueued.
    const cmds = new CommandRepo(db).recent(100);
    expect(cmds.some((c) => c.type === 'app_install')).toBe(true);
  });

  it('returns 409 on re-install', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) return fakeOk({ id: 7777, slug: 'zen', name: 'Zen' });
      return fakeErr(404);
    });
    const pem = newPem();
    const app = makeApp();
    await app.request('/api/connectors/catalog/github-app/install', {
      method: 'POST',
      body: JSON.stringify({ appId: '7777', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    const second = await app.request('/api/connectors/catalog/github-app/install', {
      method: 'POST',
      body: JSON.stringify({ appId: '7777', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as {
      errorKind: string;
      error: string;
      existingAppName: string;
    };
    expect(body.error).toBe('app_already_installed');
    expect(body.existingAppName).toBe('Zen');
  });

  // Spec 0045 R1 F1: single-app constraint — reject install of a DIFFERENT
  // appId when another github-app row already exists.
  it('returns 409 when installing a DIFFERENT appId after one is already installed', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) {
        // Distinguish requests by JWT (different pems → different sigs).
        return fakeOk({ id: 7777, slug: 'zen', name: 'Zen' });
      }
      return fakeErr(404);
    });
    const pem = newPem();
    const app = makeApp();
    // Install first app (id 7777)
    const first = await app.request('/api/connectors/catalog/github-app/install', {
      method: 'POST',
      body: JSON.stringify({ appId: '7777', pem }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(first.status).toBe(200);
    // Try to install second app with id 8888 — should be rejected by the
    // single-app guard regardless of appId.
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) return fakeOk({ id: 8888, slug: 'second', name: 'Second' });
      return fakeErr(404);
    });
    const pem2 = newPem();
    const second = await app.request('/api/connectors/catalog/github-app/install', {
      method: 'POST',
      body: JSON.stringify({ appId: '8888', pem: pem2 }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('app_already_installed');
  });
});

describe('POST /api/connectors/catalog/github-app/installations/discover', () => {
  it('returns 404 when no app installed', async () => {
    const res = await makeApp().request(
      '/api/connectors/catalog/github-app/installations/discover',
      { method: 'POST', body: '{}', headers: csrfHeaders({ 'Content-Type': 'application/json' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns installations with alreadyWired flags', async () => {
    // Seed a connector_app + 1 wired connector
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: newPem(),
      pemSha256: 'fake',
    });
    const connRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    connRepo.create({
      slug: 'github-app-acme',
      displayName: 'GitHub App — Acme',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [
        { key: '__GITHUB_INSTALLATION_ID__', value: '100' },
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'acme' },
      ],
      tools: [],
      appId: app.id,
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/app/installations')) {
        return fakeOk([
          {
            id: 100,
            account: { login: 'acme', type: 'Org' },
            permissions: {},
            repository_selection: 'all',
          },
          {
            id: 200,
            account: { login: 'beta', type: 'User' },
            permissions: {},
            repository_selection: 'all',
          },
        ]);
      }
      return fakeErr(404);
    });

    const res = await makeApp().request(
      '/api/connectors/catalog/github-app/installations/discover',
      { method: 'POST', body: '{}', headers: csrfHeaders({ 'Content-Type': 'application/json' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      installations: Array<{ id: string; name: string; alreadyWired: boolean }>;
    };
    expect(body.installations).toHaveLength(2);
    const acme = body.installations.find((i) => i.id === '100');
    const beta = body.installations.find((i) => i.id === '200');
    expect(acme?.alreadyWired).toBe(true);
    expect(beta?.alreadyWired).toBe(false);
  });
});

describe('POST /api/connectors/catalog/github-app/installations', () => {
  it('returns 404 when app not installed', async () => {
    const res = await makeApp().request('/api/connectors/catalog/github-app/installations', {
      method: 'POST',
      body: JSON.stringify({
        installationId: '100',
        displayName: 'acme',
      }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(404);
  });

  it('enqueues connector_create with the right payload', async () => {
    const appRepo = new ConnectorAppRepo(db);
    appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: newPem(),
      pemSha256: 'sha',
    });
    const res = await makeApp().request('/api/connectors/catalog/github-app/installations', {
      method: 'POST',
      body: JSON.stringify({
        installationId: '100',
        displayName: 'Acme Corp',
      }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(202);
    const responseBody = (await res.json()) as { correlationId: string; slug: string };
    expect(responseBody.correlationId).toMatch(/[0-9a-f-]{36}/);
    expect(responseBody.slug).toBe('github-app-acme-corp');

    const cmds = new CommandRepo(db).recent(100);
    const create = cmds.find((c) => c.type === 'connector_create');
    expect(create).toBeDefined();
    const payload = JSON.parse(create?.payload ?? '{}') as {
      slug: string;
      secrets: Array<{ key: string; value: string }>;
      appId: string;
    };
    expect(payload.slug).toBe('github-app-acme-corp');
    expect(payload.appId).toMatch(/[0-9a-f-]{36}/);
    const map = new Map(payload.secrets.map((s) => [s.key, s.value]));
    expect(map.get('__GITHUB_INSTALLATION_ID__')).toBe('100');
    expect(map.get('__GITHUB_INSTALLATION_NAME__')).toBe('Acme Corp');
    // Spec 0051: __GITHUB_ENV_VAR__ no longer written.
    expect(map.has('__GITHUB_ENV_VAR__')).toBe(false);
    // No __GITHUB_APP_ID__ / __GITHUB_APP_PEM__ in v2 secrets.
    expect(map.has('__GITHUB_APP_ID__')).toBe(false);
    expect(map.has('__GITHUB_APP_PEM__')).toBe(false);
  });

  // Spec 0051: env_var_in_use 409 test removed alongside the operator-picked
  // envVar field.
});

// Spec 0051: rotate-PEM endpoint removed. Tests deleted alongside the route.

describe('POST /api/connectors/catalog/github-app/uninstall-app', () => {
  // Spec 2026-05-09-cli-ux-overhaul Task 25 (E2): the case-sensitive
  // `confirmAppName` body field was retired in favor of CLI-side
  // `confirmDestructive` (with `--yes` to bypass). The "rejects mismatched"
  // test was dropped alongside the validation.

  it('deletes the connector_apps row and cascades to connectors', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: newPem(),
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    connRepo.create({
      slug: 'github-app-acme',
      displayName: 'Acme',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [],
      tools: [],
      appId: app.id,
    });

    const res = await makeApp().request('/api/connectors/catalog/github-app/uninstall-app', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { correlationId: string };
    expect(body.correlationId).toMatch(/[0-9a-f-]{36}/);

    expect(appRepo.getOneByCatalog('github-app')).toBeNull();
    expect(connRepo.getBySlug('github-app-acme')).toBeNull();

    const cmds = new CommandRepo(db).recent(100);
    expect(cmds.some((c) => c.type === 'app_uninstall')).toBe(true);
  });
});

describe('GET /api/connectors/catalog/github-app/app', () => {
  it('returns 404 when not installed', async () => {
    const res = await makeApp().request('/api/connectors/catalog/github-app/app', {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns app metadata when installed', async () => {
    const appRepo = new ConnectorAppRepo(db);
    appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: newPem(),
      pemSha256: 'a'.repeat(64),
    });
    const res = await makeApp().request('/api/connectors/catalog/github-app/app', {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { appId: string; appName: string; pemSha256: string };
    expect(body.appId).toBe('7777');
    expect(body.appName).toBe('Zen');
    expect(body.pemSha256).toBe('a'.repeat(64));
  });
});
