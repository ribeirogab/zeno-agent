/**
 * Spec 0046: lifecycle endpoint integration tests.
 *
 * Covers:
 *   - POST /catalog/github-app/uninstall-app cascades.
 *
 * Spec 0051 retired the M11 envVar PATCH and the rotate-PEM endpoint;
 * their tests were removed alongside the features.
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
    knowledgeRoot: '/tmp',
    writes: 'dashboard',
  });
}

// Spec 0051: M11 envVar PATCH tests removed alongside the feature.

// Spec 0051: M9 (rotate-PEM) lifecycle test removed alongside the feature.

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
      body: JSON.stringify({}),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { correlationId: string };
    expect(body.correlationId).toMatch(/[0-9a-f-]{36}/);

    expect(appRepo.getOneByCatalog('github-app')).toBeNull();
    expect(connRepo.getBySlug('github-app-acme')).toBeNull();
    expect(connRepo.getBySlug('github-app-beta')).toBeNull();

    const cmds = new CommandRepo(db).recent(100);
    expect(cmds.some((c) => c.type === 'app_uninstall')).toBe(true);
  });
});
