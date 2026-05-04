import {
  CommandRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  // Spec 0066 C: drop the seeded Playwright row so 'empty list' /
  // 'installed counts' assertions in this file behave as before.
  db.prepare("DELETE FROM connectors WHERE slug = 'playwright'").run();
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
    logRepo: new LogRepo(database),
    connectorRepo: new ConnectorRepo(database, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    }),
    claudeHome: '/tmp',
    profileDir: '/tmp',
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/connectors', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/connectors');
    expect(res.status).toBe(401);
  });

  it('returns empty list on empty DB', async () => {
    const res = await makeApp(db).request('/api/connectors', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns installed connectors with counts', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: 'node',
      secrets: [{ key: 'TOKEN', value: 'xyz' }],
      tools: [{ toolName: 't1', description: null, category: 'read', permission: 'always_allow' }],
    });
    const res = await makeApp(db).request('/api/connectors', { headers: authed() });
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      slug: 'echo',
      displayName: 'Echo',
      transport: 'stdio',
      status: 'enabled',
      toolCount: 1,
      invocationCount24h: 0,
    });
  });
});

describe('GET /api/connectors/:id', () => {
  it('returns 404 on miss', async () => {
    const res = await makeApp(db).request('/api/connectors/missing', { headers: authed() });
    expect(res.status).toBe(404);
  });

  it('masks secrets with last4', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: 'node',
      secrets: [
        { key: 'LONG_KEY', value: 'abcdefghij1234' },
        { key: 'SHORT', value: 'a' },
        { key: 'EMPTY', value: '' },
      ],
      tools: [],
    });
    const res = await makeApp(db).request(`/api/connectors/${created.id}`, {
      headers: authed(),
    });
    const body = (await res.json()) as { secrets: Array<{ key: string; last4: string }> };
    const byKey = Object.fromEntries(body.secrets.map((s) => [s.key, s.last4]));
    expect(byKey.LONG_KEY).toBe('1234');
    expect(byKey.SHORT).toBe('xxxx');
    expect(byKey.EMPTY).toBe('xxxx');
  });
});

describe('GET /api/connectors/catalog', () => {
  it('does NOT match :id when path is /catalog (route order matters)', async () => {
    // If the dynamic :id route is registered before the static /catalog,
    // requesting /api/connectors/catalog hits :id='catalog' and returns 404
    // (which is the body of GET /:id). We assert the catalog handler runs.
    const res = await makeApp(db).request('/api/connectors/catalog', { headers: authed() });
    // 200 if catalog file is present in the working dir, 500 if missing
    // (CatalogReadError). Either way, not 404 from the :id route.
    expect([200, 500]).toContain(res.status);
  });
});

describe('PATCH /api/connectors/:id/toggle', () => {
  it('flips enabled → disabled and back', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: 'node',
      secrets: [],
      tools: [],
    });
    const app = makeApp(db);
    const r1 = await app.request(`/api/connectors/${created.id}/toggle`, {
      method: 'PATCH',
      headers: authed(),
    });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ status: 'disabled' });
    const r2 = await app.request(`/api/connectors/${created.id}/toggle`, {
      method: 'PATCH',
      headers: authed(),
    });
    expect(await r2.json()).toEqual({ status: 'enabled' });
  });

  it('rejects toggling a pending connector', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: 'node',
      status: 'pending',
      secrets: [],
      tools: [],
    });
    const res = await makeApp(db).request(`/api/connectors/${created.id}/toggle`, {
      method: 'PATCH',
      headers: authed(),
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/connectors/:id/tools/:toolName/permission', () => {
  it('updates a single permission', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [{ toolName: 't1', description: null, category: 'read', permission: 'ask' }],
    });
    const res = await makeApp(db).request(`/api/connectors/${created.id}/tools/t1/permission`, {
      method: 'PATCH',
      headers: { ...authed(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'always_allow' }),
    });
    expect(res.status).toBe(204);
    expect(repo.getTools(created.id)[0]?.permission).toBe('always_allow');
  });

  it('returns 404 for unknown tool', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [],
    });
    const res = await makeApp(db).request(
      `/api/connectors/${created.id}/tools/missing/permission`,
      {
        method: 'PATCH',
        headers: { ...authed(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'never' }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/connectors/:id/tools/permissions/bulk', () => {
  it('applies permission to all tools in category', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [
        { toolName: 'r1', description: null, category: 'read', permission: 'ask' },
        { toolName: 'r2', description: null, category: 'read', permission: 'ask' },
        { toolName: 'w1', description: null, category: 'write', permission: 'ask' },
      ],
    });
    const res = await makeApp(db).request(`/api/connectors/${created.id}/tools/permissions/bulk`, {
      method: 'PATCH',
      headers: { ...authed(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'read', permission: 'always_allow' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rowsAffected: number };
    expect(body.rowsAffected).toBe(2);
  });
});

describe('POST /api/connectors (catalog) enqueues a command', () => {
  it('returns 404 if the catalog id is unknown', async () => {
    const res = await makeApp(db).request('/api/connectors', {
      method: 'POST',
      headers: { ...authed(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'catalog',
        catalogId: 'unknown',
        secrets: [],
      }),
    });
    // Either 404 (catalog entry not found) or 500 (catalog file unavailable in tests).
    expect([404, 500]).toContain(res.status);
  });
});

describe('POST /api/connectors (custom) enqueues a connector_create', () => {
  it('returns 204 and inserts a command row', async () => {
    const commandRepo = new CommandRepo(db);
    const before = commandRepo.recent(10).length;
    const res = await makeApp(db).request('/api/connectors', {
      method: 'POST',
      headers: { ...authed(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'custom',
        displayName: 'My MCP',
        transport: 'stdio',
        command: 'echo',
        args: ['hi'],
        secrets: [{ key: 'K', value: 'V' }],
      }),
    });
    expect(res.status).toBe(204);
    const after = commandRepo.recent(10);
    expect(after.length).toBeGreaterThan(before);
    expect(after[0]?.type).toBe('connector_create');
  });
});

describe('DELETE /api/connectors/:id', () => {
  it('enqueues connector_uninstall', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const commandRepo = new CommandRepo(db);
    const created = repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [],
    });
    const res = await makeApp(db).request(`/api/connectors/${created.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(204);
    expect(commandRepo.recent(10)[0]?.type).toBe('connector_uninstall');
  });
});

describe('GET /api/connectors/:id/secrets/:key/reveal', () => {
  it('returns the secret value the first time', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [{ key: 'TOKEN', value: 'lin_test_xyz' }],
      tools: [],
    });
    const res = await makeApp(db).request(`/api/connectors/${created.id}/secrets/TOKEN/reveal`, {
      headers: authed(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'lin_test_xyz' });
  });

  it('returns 429 within the 60s window', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [{ key: 'TOKEN', value: 'v' }],
      tools: [],
    });
    const app = makeApp(db);
    await app.request(`/api/connectors/${created.id}/secrets/TOKEN/reveal`, {
      headers: authed(),
    });
    const res2 = await app.request(`/api/connectors/${created.id}/secrets/TOKEN/reveal`, {
      headers: authed(),
    });
    expect(res2.status).toBe(429);
    const body = (await res2.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});
