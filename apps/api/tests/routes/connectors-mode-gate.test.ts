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
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiWriteMode } from '@/lib/api-mode';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
});

function makeApp(database: RuntimeDB, writes: ApiWriteMode) {
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
    writes,
  });
}

describe('connectors mutations gated by writes:cli', () => {
  it("POST /api/connectors returns 403 mode_cli_only under writes:'cli'", async () => {
    const res = await makeApp(db, 'cli').request('/api/connectors', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'custom',
        displayName: 'X',
        transport: 'stdio',
        command: 'echo',
        secrets: [],
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; cli: string; action: string };
    expect(body.error).toBe('mode_cli_only');
    expect(body.cli).toMatch(/^zeno connector install/);
  });

  it('PATCH /api/connectors/:id/toggle returns 403 under cli mode', async () => {
    const res = await makeApp(db, 'cli').request('/api/connectors/abc/toggle', {
      method: 'PATCH',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('mode_cli_only');
  });

  it('DELETE /api/connectors/:id returns 403 under cli mode', async () => {
    const res = await makeApp(db, 'cli').request('/api/connectors/abc', {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('mode_cli_only');
  });

  it("POST /api/connectors returns 202 + correlationId under writes:'dashboard'", async () => {
    const commandRepo = new CommandRepo(db);
    const before = commandRepo.recent(10).length;
    const res = await makeApp(db, 'dashboard').request('/api/connectors', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'custom',
        displayName: 'My MCP',
        transport: 'stdio',
        command: 'echo',
        args: ['hi'],
        secrets: [{ key: 'K', value: 'V' }],
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { correlationId: string };
    expect(body.correlationId).toMatch(/[0-9a-f-]{36}/);
    const after = commandRepo.recent(10);
    expect(after.length).toBeGreaterThan(before);
    expect(after[0]?.type).toBe('connector_create');
  });

  it("GET /api/connectors returns 200 even under writes:'cli'", async () => {
    const res = await makeApp(db, 'cli').request('/api/connectors', {
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("CLI origin header bypasses the gate under writes:'cli'", async () => {
    // The CLI sends `x-zeno-origin: cli` on every request; under cli-mode the
    // gate must let CLI mutations through (otherwise the rework breaks itself —
    // CLI couldn't install connectors). Trust-based: API binds 127.0.0.1 only.
    const res = await makeApp(db, 'cli').request('/api/connectors', {
      method: 'POST',
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json',
        'x-zeno-origin': 'cli',
      },
      body: JSON.stringify({
        source: 'custom',
        displayName: 'CLI install',
        transport: 'stdio',
        command: 'echo',
        secrets: [],
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { correlationId: string };
    expect(body.correlationId).toMatch(/[0-9a-f-]{36}/);
  });

  it("CLI origin header bypasses gate on PATCH /:id/toggle under writes:'cli'", async () => {
    // Seed an enabled connector so the toggle has something to flip
    const connectorRepo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = connectorRepo.create({
      slug: 'sample',
      displayName: 'Sample',
      source: 'custom',
      transport: 'stdio',
      command: 'echo',
      secrets: [],
      tools: [],
    });
    const res = await makeApp(db, 'cli').request(`/api/connectors/${created.id}/toggle`, {
      method: 'PATCH',
      headers: { ...csrfHeaders(), 'x-zeno-origin': 'cli' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('disabled');
  });

  it('a fake origin header value does NOT bypass the gate', async () => {
    // Defense-in-depth: only the literal value 'cli' bypasses; everything else
    // (e.g. a typo, an attempt to spoof) still gets blocked. Trust is by binding,
    // but the value-equality check guards against accidental allows.
    const res = await makeApp(db, 'cli').request('/api/connectors', {
      method: 'POST',
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json',
        'x-zeno-origin': 'dashboard',
      },
      body: JSON.stringify({
        source: 'custom',
        displayName: 'X',
        transport: 'stdio',
        command: 'echo',
        secrets: [],
      }),
    });
    expect(res.status).toBe(403);
  });
});
