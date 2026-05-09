/**
 * Spec 0045: GET /api/connectors returns a discriminated union of
 * ConnectorListItem (kind='connector') and AppListItem (kind='app').
 * github-app-* connectors are nested inside their parent AppListItem.
 */

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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
const originalCwd = process.cwd();
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

interface ConnectorListItem {
  kind: 'connector';
  id: string;
  slug: string;
  displayName: string;
  status: string;
}

interface AppListItem {
  kind: 'app';
  appUuid: string;
  appId: string;
  appName: string;
  installationCount: number;
  statusAggregate: 'active' | 'mixed' | 'error';
  installations: Array<{ slug: string; status: string }>;
}

type ListEntry = ConnectorListItem | AppListItem;

describe('GET /api/connectors — discriminated union', () => {
  it('returns standalone connectors with kind="connector"', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    repo.create({
      slug: 'linear',
      displayName: 'Linear',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      url: 'https://x',
      secrets: [],
      tools: [],
    });
    const res = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const items = (await res.json()) as ListEntry[];
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('connector');
    expect((items[0] as ConnectorListItem).slug).toBe('linear');
  });

  it('collapses github-app installations under a single AppListItem', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zeno-bot',
      appName: 'Zeno Bot',
      pem: 'pem',
      pemSha256: 'sha',
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
      secrets: [],
      tools: [],
      appId: app.id,
    });
    connRepo.create({
      slug: 'github-app-beta',
      displayName: 'GitHub App — Beta',
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
      slug: 'linear',
      displayName: 'Linear',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      url: 'https://x',
      secrets: [],
      tools: [],
    });

    const res = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const items = (await res.json()) as ListEntry[];

    // Should have 2 top-level rows: 1 standalone Linear connector + 1 App row
    expect(items).toHaveLength(2);
    const connectors = items.filter((i) => i.kind === 'connector') as ConnectorListItem[];
    const apps = items.filter((i) => i.kind === 'app') as AppListItem[];

    expect(connectors).toHaveLength(1);
    expect(connectors[0]?.slug).toBe('linear');

    expect(apps).toHaveLength(1);
    expect(apps[0]?.appName).toBe('Zeno Bot');
    expect(apps[0]?.installationCount).toBe(2);
    expect(apps[0]?.installations.map((i) => i.slug).sort()).toEqual([
      'github-app-acme',
      'github-app-beta',
    ]);
  });

  it('aggregates statusAggregate=active when all installations are enabled+verified', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const c1 = connRepo.create({
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
    connRepo.update(c1.id, { lastVerifiedAt: '2026-04-01T00:00:00Z' });

    const res = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    const items = (await res.json()) as ListEntry[];
    const appItem = items.find((i) => i.kind === 'app') as AppListItem | undefined;
    expect(appItem?.statusAggregate).toBe('active');
  });

  it('aggregates statusAggregate=error when any installation has lastError', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const c1 = connRepo.create({
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
    connRepo.update(c1.id, {
      lastError: 'token revoked',
      // Recent timestamp — outside 24h window the App falls back to 'mixed'
      // (stale errors don't lock the App into 'error' forever). Spec 0048 R2 F2.
      lastErrorAt: new Date().toISOString(),
    });

    const res = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    const items = (await res.json()) as ListEntry[];
    const appItem = items.find((i) => i.kind === 'app') as AppListItem | undefined;
    expect(appItem?.statusAggregate).toBe('error');
  });

  it('falls back to non-error when lastErrorAt is older than 24h (spec 0048 R2 F2)', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const c1 = connRepo.create({
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
    // 48h-old error → must NOT lock the App into 'error' state.
    connRepo.update(c1.id, {
      lastError: 'token revoked long ago',
      lastErrorAt: new Date(Date.now() - 48 * 60 * 60_000).toISOString(),
    });

    const res = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    const items = (await res.json()) as ListEntry[];
    const appItem = items.find((i) => i.kind === 'app') as AppListItem | undefined;
    expect(appItem?.statusAggregate).not.toBe('error');
  });

  it('groups standalone catalog rows into connector_group when count>1', async () => {
    // Spec 2026-05-08 Q2 + Q5: multi-instance plain catalogs collapse into a
    // single connector_group; single-instance catalogs stay flat.
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    for (const label of ['Acme', 'Personal', 'Side-project']) {
      repo.create({
        slug: `linear-${label.toLowerCase()}`,
        displayName: 'Linear',
        instanceLabel: label,
        source: 'catalog',
        catalogId: 'linear',
        transport: 'remote',
        url: 'https://x',
        secrets: [],
        tools: [],
      });
    }
    const res = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const items = (await res.json()) as Array<{
      kind: string;
      catalogId?: string | null;
      installations?: unknown[];
    }>;
    const group = items.find((it) => it.kind === 'connector_group' && it.catalogId === 'linear');
    expect(group).toBeDefined();
    expect(group?.installations).toHaveLength(3);

    // Single-instance catalogs stay flat (no collapse).
    repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'stdio',
      command: 'sentry-mcp',
      args: [],
      secrets: [],
      tools: [],
    });
    const res2 = await makeApp().request('/api/connectors', { headers: csrfHeaders() });
    const items2 = (await res2.json()) as Array<{ kind: string; catalogId?: string | null }>;
    expect(items2.find((it) => it.kind === 'connector' && it.catalogId === 'sentry')).toBeDefined();
  });
});

describe('GET /api/connectors/apps/:appUuid', () => {
  it('returns 404 for unknown appUuid', async () => {
    const res = await makeApp().request('/api/connectors/apps/unknown-uuid', {
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('returns app + installations with full detail', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen-bot',
      appName: 'Zen Bot',
      pem: 'pem',
      pemSha256: 'fp-sha-256',
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
        { key: '__GITHUB_INSTALLATION_NAME__', value: 'Acme' },
      ],
      tools: [
        {
          toolName: 'list_issues',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      appId: app.id,
    });

    const res = await makeApp().request(`/api/connectors/apps/${app.id}`, {
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      app: { appName: string; pemSha256: string; pem?: string };
      installations: Array<{
        slug: string;
        installationId: string | null;
        toolCount: number;
      }>;
    };
    expect(body.app.appName).toBe('Zen Bot');
    expect(body.app.pemSha256).toBe('fp-sha-256');
    // PEM must NOT be in the response.
    expect(body.app.pem).toBeUndefined();
    expect(body.installations).toHaveLength(1);
    expect(body.installations[0]?.slug).toBe('github-app-acme');
    expect(body.installations[0]?.installationId).toBe('100');
    expect(body.installations[0]?.toolCount).toBe(1);
  });

  it('does NOT collide with /:id route', async () => {
    const appRepo = new ConnectorAppRepo(db);
    const app = appRepo.create({
      catalogId: 'github-app',
      appId: '7777',
      appSlug: 'zen',
      appName: 'Zen',
      pem: 'pem',
      pemSha256: 'sha',
    });
    const connRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
      appId: app.id,
    });

    // Hitting /:id with the connector id should still return the connector
    // (Hono matches /apps/:appUuid first, then /:id).
    const res = await makeApp().request(`/api/connectors/${created.id}`, {
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
  });
});
