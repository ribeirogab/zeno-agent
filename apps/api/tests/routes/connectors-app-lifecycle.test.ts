/**
 * Spec 0046: lifecycle endpoint integration tests.
 *
 * Covers:
 *   - PATCH /:id with `{envVar: 'NEW_NAME'}` (M11) translates to a
 *     secrets-only patch and enqueues `connector_update`.
 *   - PATCH /:id with `{envVar}` on a non-github-app connector returns 400.
 *   - POST /catalog/github-app/rotate-pem flow (success path with mocked fetch).
 *   - POST /catalog/github-app/uninstall-app cascades.
 */

import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import {
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function authed(): { Cookie: string; 'Content-Type': string } {
  return {
    Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}`,
    'Content-Type': 'application/json',
  };
}

function newPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

let db: DB;
let mockFetch: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
const repoRoot = resolve(__dirname, '..', '..', '..', '..');

beforeAll(() => {
  process.chdir(repoRoot);
});
afterAll(() => {
  process.chdir(originalCwd);
});

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  db.close();
});

function makeApp() {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db,
    cronRepo: new CronRepo(db),
    cronRunRepo: new CronRunRepo(db),
    commandRepo: new CommandRepo(db),
    logRepo: new LogRepo(db),
    connectorRepo: new ConnectorRepo(db),
    connectorAppRepo: new ConnectorAppRepo(db),
    claudeHome: '/tmp',
    profileDir: '/tmp',
  });
}

describe('PATCH /api/connectors/:id with {envVar} (M11 rename)', () => {
  it('translates envVar into a secrets-only patch + enqueues connector_update', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db);
    const created = connRepo.create({
      slug: 'github-app-acme',
      displayName: 'GitHub App — Acme',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [
        { key: '__GITHUB_INSTALLATION_ID__', value: '100' },
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'Acme' },
        { key: '__GITHUB_ENV_VAR__', value: 'OLD_TOKEN' },
      ],
      tools: [],
      appId: app.id,
    });

    const res = await makeApp().request(`/api/connectors/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ envVar: 'NEW_TOKEN' }),
      headers: authed(),
    });
    expect(res.status).toBe(204);

    const cmds = new CommandRepo(db).recent(100);
    const cmd = cmds.find((c) => c.type === 'connector_update');
    expect(cmd).toBeDefined();
    const payload = JSON.parse(cmd?.payload ?? '{}') as {
      id: string;
      patch: Record<string, unknown>;
      secrets: Array<{ key: string; value: string }>;
    };
    expect(payload.id).toBe(created.id);
    // envVar is stripped from the top-level patch...
    expect(payload.patch.envVar).toBeUndefined();
    // ...and translated into a secrets-only patch with the new __GITHUB_ENV_VAR__.
    const map = new Map(payload.secrets.map((s) => [s.key, s.value]));
    expect(map.get('__GITHUB_ENV_VAR__')).toBe('NEW_TOKEN');
    // Other reserved keys preserved.
    expect(map.get('__GITHUB_INSTALLATION_ID__')).toBe('100');
    expect(map.get('__GITHUB_INSTALLATION_NAME__')).toBe('Acme');
  });

  it('rejects envVar PATCH on a non-github-app connector with 400', async () => {
    const connRepo = new ConnectorRepo(db);
    const created = connRepo.create({
      slug: 'linear',
      displayName: 'Linear',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      url: 'https://x',
      secrets: [],
      tools: [],
    });
    const res = await makeApp().request(`/api/connectors/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ envVar: 'BOGUS_TOKEN' }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects envVar with invalid format (lowercase) with 400 from zod', async () => {
    const connRepo = new ConnectorRepo(db);
    const created = connRepo.create({
      slug: 'github-app-acme',
      displayName: 'Acme',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [],
      tools: [],
    });
    const res = await makeApp().request(`/api/connectors/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ envVar: 'lowercase_bad' }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects envVar already in use by another installation with 409 (R3 F1)', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db);
    // Existing installation A using GITHUB_TOKEN_A.
    connRepo.create({
      slug: 'github-app-a',
      displayName: 'A',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [
        { key: '__GITHUB_INSTALLATION_ID__', value: '100' },
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'A' },
        { key: '__GITHUB_ENV_VAR__', value: 'GITHUB_TOKEN_A' },
      ],
      tools: [],
      appId: app.id,
    });
    // Installation B trying to rename its envVar to A's.
    const b = connRepo.create({
      slug: 'github-app-b',
      displayName: 'B',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [
        { key: '__GITHUB_INSTALLATION_ID__', value: '200' },
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'B' },
        { key: '__GITHUB_ENV_VAR__', value: 'GITHUB_TOKEN_B' },
      ],
      tools: [],
      appId: app.id,
    });
    const res = await makeApp().request(`/api/connectors/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ envVar: 'GITHUB_TOKEN_A' }),
      headers: authed(),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      ok: boolean;
      errorKind: string;
      error: string;
      envVar: string;
    };
    expect(body.ok).toBe(false);
    expect(body.errorKind).toBe('conflict');
    expect(body.error).toBe('env_var_in_use');
    expect(body.envVar).toBe('GITHUB_TOKEN_A');
  });

  it('allows envVar PATCH that keeps its own current value (self-update, R3 F1)', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db);
    const a = connRepo.create({
      slug: 'github-app-a',
      displayName: 'A',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [
        { key: '__GITHUB_INSTALLATION_ID__', value: '100' },
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'A' },
        { key: '__GITHUB_ENV_VAR__', value: 'GITHUB_TOKEN_A' },
      ],
      tools: [],
      appId: app.id,
    });
    // PATCH the same envVar back — must not 409 against itself.
    const res = await makeApp().request(`/api/connectors/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ envVar: 'GITHUB_TOKEN_A' }),
      headers: authed(),
    });
    expect(res.status).toBe(204);
  });
});

describe('POST /api/connectors/catalog/github-app/rotate-pem (M9)', () => {
  it('validates the new PEM and atomically updates connector_apps + enqueues app_pem_rotated', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const oldPem = newPem();
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: oldPem,
      pemSha256: 'old-sha',
    });
    new ConnectorRepo(db).create({
      slug: 'github-app-acme',
      displayName: 'Acme',
      source: 'catalog',
      catalogId: 'github-app',
      transport: 'stdio',
      command: 'github-mcp-server',
      args: ['stdio'],
      secrets: [
        { key: '__GITHUB_INSTALLATION_ID__', value: '100' },
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'Acme' },
        { key: '__GITHUB_ENV_VAR__', value: 'GITHUB_TOKEN_ACME' },
      ],
      tools: [],
      appId: app.id,
    });

    const newPemValue = newPem();
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/app')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ id: 7777, slug: 'zen', name: 'Zen' }),
          headers: { get: () => null },
        });
      }
      if (url.includes('/installations/100/access_tokens')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            token: 'ghs_new',
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          }),
          headers: { get: () => null },
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        text: async () => 'err',
        json: async () => ({}),
      });
    });

    const res = await makeApp().request('/api/connectors/catalog/github-app/rotate-pem', {
      method: 'POST',
      body: JSON.stringify({ newPem: newPemValue, confirmAppId: '7777' }),
      headers: authed(),
    });
    expect(res.status).toBe(200);

    // Row was updated atomically.
    const after = appRepo.getOneByCatalog('github-app');
    expect(after?.pem).toBe(newPemValue);
    expect(after?.pem).not.toBe(oldPem);
    expect(after?.pemRotatedAt).not.toBeNull();
    expect(after?.pemSha256).not.toBe('old-sha');

    // Worker command was enqueued.
    const cmds = new CommandRepo(db).recent(100);
    expect(cmds.some((c) => c.type === 'app_pem_rotated')).toBe(true);
    // Spec 0044 R1 F1: PEM is NOT in the command payload (single source of truth).
    const rotateCmd = cmds.find((c) => c.type === 'app_pem_rotated');
    const payload = JSON.parse(rotateCmd?.payload ?? '{}') as Record<string, unknown>;
    expect(payload.newPem).toBeUndefined();
    expect(payload.appUuid).toBe(app.id);
  });
});

describe('POST /api/connectors/catalog/github-app/uninstall-app cascade', () => {
  it('deletes connector_apps + cascades to connectors + enqueues app_uninstall', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: newPem(),
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db);
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
    connRepo.create({
      slug: 'github-app-beta',
      displayName: 'Beta',
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
      body: JSON.stringify({ confirmAppName: 'Zen' }),
      headers: authed(),
    });
    expect(res.status).toBe(200);

    expect(appRepo.getOneByCatalog('github-app')).toBeNull();
    expect(connRepo.getBySlug('github-app-acme')).toBeNull();
    expect(connRepo.getBySlug('github-app-beta')).toBeNull();

    const cmds = new CommandRepo(db).recent(100);
    expect(cmds.some((c) => c.type === 'app_uninstall')).toBe(true);
  });
});
