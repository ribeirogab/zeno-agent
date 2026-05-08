import { resolve } from 'node:path';
import {
  CommandRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetChannelsCatalogCache, loadChannelsCatalog } from '@/lib/channels-catalog-loader';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

// Spec 0057: chdir to worktree root so AGENT_CANDIDATES = ['agent'] resolves.
// catalog-loader.ts and channels-catalog-loader.ts read 'agent/' relative to
// CWD; without this, vitest runs from apps/api/ and the catalogs 404.
const ORIGINAL_CWD = process.cwd();
const WORKTREE_ROOT = resolve(__dirname, '../../../..');
beforeAll(() => process.chdir(WORKTREE_ROOT));
afterAll(() => process.chdir(ORIGINAL_CWD));

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
});

afterEach(() => {
  _resetChannelsCatalogCache();
});

function makeApp(database: RuntimeDB) {
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
    connectorRepo: new ConnectorRepo(database, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    }),
    claudeHome: '/tmp',
    profileDir: '/tmp',
    channelsCatalog: loadChannelsCatalog(),
    writes: 'dashboard',
  });
}

describe('GET /api/channels/catalog (spec 0057)', () => {
  it('returns the channels catalog with at least Slack', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/channels/catalog', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { channels: Array<{ id: string; name: string }> };
    const slack = body.channels.find((c) => c.id === 'slack');
    expect(slack).toBeDefined();
    expect(slack?.name).toBe('Slack');
  });

  it('catalog entries include iconUrl pointing to /api/connectors/catalog/icons', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/channels/catalog', { headers: csrfHeaders() });
    const body = (await res.json()) as {
      channels: Array<{ id: string; iconUrl: string }>;
    };
    const slack = body.channels.find((c) => c.id === 'slack');
    expect(slack?.iconUrl).toBe('/api/connectors/catalog/icons/slack.svg');
  });
});

describe('GET /api/channels (spec 0057)', () => {
  it('returns empty array when no channels installed', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/channels', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns installed channels filtered by kind=channel', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    repo.create({
      slug: 'slack',
      displayName: 'Slack',
      source: 'catalog',
      catalogId: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      url: null,
      kind: 'channel',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-x' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-x' },
      ],
      tools: [],
    });
    // Add an MCP connector — should NOT appear in /api/channels
    repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'stdio',
      command: 'echo',
      args: [],
      kind: 'mcp',
      secrets: [],
      tools: [],
    });

    const app = makeApp(db);
    const res = await app.request('/api/channels', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]?.slug).toBe('slack');
    // Projection: no transport / kind / appId leaking
    expect(body[0]?.transport).toBeUndefined();
    expect(body[0]?.kind).toBeUndefined();
    expect(body[0]?.command).toBeUndefined();
  });
});

describe('GET /api/connectors filters channel rows (spec 0057)', () => {
  it('GET /api/connectors does NOT include channel rows', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    repo.create({
      slug: 'slack',
      displayName: 'Slack',
      source: 'catalog',
      catalogId: 'slack',
      transport: 'remote',
      kind: 'channel',
      secrets: [],
      tools: [],
    });
    repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'stdio',
      command: 'echo',
      args: [],
      kind: 'mcp',
      secrets: [],
      tools: [],
    });

    const app = makeApp(db);
    const res = await app.request('/api/connectors', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ slug: string }>;
    const slugs = body.map((c) => c.slug);
    expect(slugs).toContain('sentry');
    expect(slugs).not.toContain('slack');
  });
});

describe('POST /api/connectors with kind=channel (spec 0057)', () => {
  it('installs Slack channel via catalog source + kind=channel', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'catalog',
        catalogId: 'slack',
        kind: 'channel',
        secrets: [
          { key: 'SLACK_APP_TOKEN', value: 'xapp-x' },
          { key: 'SLACK_BOT_TOKEN', value: 'xoxb-x' },
        ],
      }),
    });
    expect(res.status).toBe(202);
    const responseBody = (await res.json()) as { correlationId: string };
    expect(responseBody.correlationId).toMatch(/[0-9a-f-]{36}/);

    // Spec 0057: API enqueues a connector_create command; worker processes it.
    // For this test assert the command was enqueued (worker handler tested
    // separately in apps/worker/tests/connectors-e2e/p2-lifecycle.test.ts).
    const rows = opened.raw
      .prepare("SELECT type, payload FROM commands WHERE type = 'connector_create'")
      .all() as Array<{ type: string; payload: string }>;
    expect(rows.length).toBe(1);
    const payload = JSON.parse(rows[0]!.payload) as { kind: string; slug: string };
    expect(payload.kind).toBe('channel');
    expect(payload.slug).toBe('slack');
  });

  it('rejects source=custom + kind=channel with 400', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'custom',
        kind: 'channel',
        displayName: 'Bogus',
        transport: 'stdio',
        secrets: [],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('channel_must_be_catalog_source');
  });

  it('returns 404 when channel catalogId is unknown', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'catalog',
        catalogId: 'discord', // not in channels-catalog.json
        kind: 'channel',
        secrets: [],
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('channel_catalog_entry_not_found');
  });

  it('returns 400 when required secret is missing', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'catalog',
        catalogId: 'slack',
        kind: 'channel',
        secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-x' }], // SLACK_BOT_TOKEN missing
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; key: string };
    expect(body.error).toBe('missing_required_secret');
    expect(body.key).toBe('SLACK_BOT_TOKEN');
  });
});

describe('GET /api/connectors/catalog/icons/slack.svg (spec 0057)', () => {
  it('serves Slack channel icon (extended knownIcons set)', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors/catalog/icons/slack.svg', {
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
  });
});

// ─────────────────────────────────────────────────────────────────
// Spec 0059: Channels UI — detail endpoints
// ─────────────────────────────────────────────────────────────────

describe('GET /api/channels/:id (spec 0059)', () => {
  it('returns channel-shape detail for a kind=channel row', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const channel = repo.create({
      slug: 'slack',
      displayName: 'Slack',
      source: 'catalog',
      catalogId: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      url: null,
      kind: 'channel',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-1-aaaa-v0Hk' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-bbbb-K4xR' },
      ],
      tools: [],
    });

    const app = makeApp(db);
    const res = await app.request(`/api/channels/${channel.id}`, { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(channel.id);
    expect(body.slug).toBe('slack');
    expect(body.catalogId).toBe('slack');
    expect(body.displayName).toBe('Slack');
    expect(body.iconUrl).toBe('/api/connectors/catalog/icons/slack.svg');
    expect(body.secrets).toEqual([
      { key: 'SLACK_APP_TOKEN', masked: true, last4: 'v0Hk' },
      { key: 'SLACK_BOT_TOKEN', masked: true, last4: 'K4xR' },
    ]);
    // No leaky fields from the connector shape
    expect(body.transport).toBeUndefined();
    expect(body.kind).toBeUndefined();
    expect(body.command).toBeUndefined();
  });

  it('returns 404 for a kind=mcp row', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const mcp = repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'stdio',
      command: 'echo',
      args: [],
      kind: 'mcp',
      secrets: [],
      tools: [],
    });
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${mcp.id}`, { headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown id', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/channels/nonexistent-id', { headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/channels/:id/secrets (spec 0059)', () => {
  function seedSlack() {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    return repo.create({
      slug: 'slack',
      displayName: 'Slack',
      source: 'catalog',
      catalogId: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      url: null,
      kind: 'channel',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-A-AAAA' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-B-BBBB' },
      ],
      tools: [],
    });
  }

  it('mode=merge preserves unchanged keys (REGRESSION TEST)', async () => {
    const channel = seedSlack();
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${channel.id}/secrets`, {
      method: 'PATCH',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'merge',
        secrets: [{ key: 'SLACK_BOT_TOKEN', value: 'xoxb-B2-CCCC' }],
      }),
    });
    expect(res.status).toBe(204);
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const after = repo.getSecrets(channel.id);
    const byKey = Object.fromEntries(after.map((s) => [s.key, s.value]));
    expect(byKey.SLACK_APP_TOKEN).toBe('xapp-A-AAAA'); // PRESERVED
    expect(byKey.SLACK_BOT_TOKEN).toBe('xoxb-B2-CCCC'); // CHANGED
  });

  it('mode=replace removes keys not in submitted set', async () => {
    const channel = seedSlack();
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${channel.id}/secrets`, {
      method: 'PATCH',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'replace',
        secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-NEW' }],
      }),
    });
    expect(res.status).toBe(204);
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const after = repo.getSecrets(channel.id);
    expect(after.map((s) => s.key)).toEqual(['SLACK_APP_TOKEN']);
  });

  it('defaults mode to merge when omitted', async () => {
    const channel = seedSlack();
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${channel.id}/secrets`, {
      method: 'PATCH',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-NEW' }],
      }),
    });
    expect(res.status).toBe(204);
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const after = repo.getSecrets(channel.id);
    expect(after).toHaveLength(2); // both kept due to merge default
  });

  it('returns 404 for kind=mcp row', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const mcp = repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'stdio',
      command: 'echo',
      args: [],
      kind: 'mcp',
      secrets: [],
      tools: [],
    });
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${mcp.id}/secrets`, {
      method: 'PATCH',
      headers: { ...csrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ secrets: [{ key: 'X', value: 'Y' }] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/channels/:id (spec 0059)', () => {
  it('deletes the row + cascades secrets', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const channel = repo.create({
      slug: 'slack',
      displayName: 'Slack',
      source: 'catalog',
      catalogId: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      url: null,
      kind: 'channel',
      secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-x' }],
      tools: [],
    });
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${channel.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(204);
    expect(repo.get(channel.id)).toBeNull();
    expect(repo.getSecrets(channel.id)).toEqual([]);
  });

  it('returns 404 for kind=mcp row', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const mcp = repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'stdio',
      command: 'echo',
      args: [],
      kind: 'mcp',
      secrets: [],
      tools: [],
    });
    const app = makeApp(db);
    const res = await app.request(`/api/channels/${mcp.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(404);
    expect(repo.get(mcp.id)).not.toBeNull(); // not deleted
  });
});

describe('GET /api/channels/catalog/setup/:catalogId (spec 0059)', () => {
  it('returns slack setup helper with steps + manifest', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/channels/catalog/setup/slack', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      steps: Array<{ index: number; html: string }>;
      manifest: { filename: string; content: string } | null;
    };
    expect(body.steps).toHaveLength(3);
    expect(body.steps[0]?.index).toBe(1);
    expect(body.steps[0]?.html).toContain('api.slack.com/apps');
    expect(body.manifest).not.toBeNull();
    expect(body.manifest?.filename).toBe('slack-app-manifest.json');
    expect(body.manifest?.content).toContain('"name": "zeno-agent"');
  });

  it('returns 404 for unknown catalogId', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/channels/catalog/setup/discord', {
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(404);
  });

  // Spec 0059: graceful-degradation contract for the setup helper.
  //
  // The channel-setup-helpers module reads infra/slack-app-manifest.json via
  // process.cwd() at request time. In production the worker runs with cwd=/app
  // and the file is delivered there by infra/Dockerfile (runtime stage COPY
  // line). If the file is unreachable for any reason, the helper falls through
  // both candidate paths and returns `manifest: null` with steps still intact —
  // the install modal then hides the manifest block but keeps the numbered
  // steps. This test pins that contract by mocking process.cwd() to a tmp dir
  // without infra/ and asserting the degraded shape. (Note: a missing file in
  // production is a Dockerfile regression that this unit test cannot catch
  // — that requires container-level integration testing — but pinning the
  // graceful-degradation contract here ensures the resolver never throws.)
  it('returns manifest: null when slack-app-manifest.json is unreachable (graceful degradation)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'channel-setup-helper-test-'));
    const originalCwd = process.cwd();

    // Move out of the worktree root so neither candidate path can resolve.
    process.chdir(tmpDir);
    try {
      // Re-import so the helper picks up the new cwd. Cache-bust via a query
      // string is not needed — the module reads cwd at request time.
      const { getChannelSetupHelper } = await import('../../src/lib/channel-setup-helpers');
      const helper = getChannelSetupHelper('slack');
      expect(helper).not.toBeNull();
      expect(helper?.steps).toHaveLength(3);
      expect(helper?.manifest).toBeNull();
    } finally {
      process.chdir(originalCwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
