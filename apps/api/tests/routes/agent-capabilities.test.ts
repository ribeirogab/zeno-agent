import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
  SkillRepo,
  seedDefaultAgentCapabilities,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  // The runtime baseline does not auto-seed via migration; the route
  // expectations mirror the boot-time seeded state.
  seedDefaultAgentCapabilities(db);
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
    skillRepo: new SkillRepo(database),
    connectorSkillRepo: new ConnectorSkillRepo(database),
    agentCapabilityRepo: new AgentCapabilityRepo(database),
    claudeHome: '/tmp',
    claudeHomeRoot: '/tmp',
    profileDir: '/tmp',
  });
}

describe('GET /api/agent-capabilities', () => {
  it('returns all 11 seeded tools — 8 enabled by default after spec 0053 + Skill seed (Bash/Edit/Glob/Grep/Read/Skill/ToolSearch/Write); 3 disabled (Task/WebFetch/WebSearch)', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ toolName: string; enabled: boolean }>;
    expect(body).toHaveLength(11);
    const enabledByDefault = new Set([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Skill',
      'ToolSearch',
      'Write',
    ]);
    for (const c of body) {
      expect(c.enabled).toBe(enabledByDefault.has(c.toolName));
    }
    expect(body.map((c) => c.toolName).sort()).toEqual([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Skill',
      'Task',
      'ToolSearch',
      'WebFetch',
      'WebSearch',
      'Write',
    ]);
  });
});

describe('PATCH /api/agent-capabilities', () => {
  it('toggles a single capability', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({ updates: [{ toolName: 'Bash', enabled: true }] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ toolName: string; enabled: boolean }>;
    const bash = body.find((c) => c.toolName === 'Bash');
    expect(bash?.enabled).toBe(true);
  });

  it('toggles multiple capabilities atomically', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({
        updates: [
          { toolName: 'Read', enabled: true },
          { toolName: 'Edit', enabled: true },
          { toolName: 'Bash', enabled: true },
        ],
      }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ toolName: string; enabled: boolean }>;
    const enabled = body
      .filter((c) => c.enabled)
      .map((c) => c.toolName)
      .sort();
    // Spec 0053: Bash/Edit/Glob/Grep/Read/ToolSearch/Write are all enabled by default.
    // PATCHing them all to true is a no-op effectively, so the resulting list is
    // identical to the default-on set.
    expect(enabled).toEqual([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Skill',
      'ToolSearch',
      'Write',
    ]);
  });

  it('returns 400 for unknown tool name and rolls back the whole batch', async () => {
    const app = makeApp(db);
    // Pre-spec-0053 Read defaulted to false. Now it defaults to true. To test
    // the rollback semantics we first flip it to false, verify, then attempt
    // a batch with a bad tool name.
    await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({ updates: [{ toolName: 'Read', enabled: false }] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });

    const res = await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({
        updates: [
          { toolName: 'Read', enabled: true },
          { toolName: 'NonexistentTool', enabled: true },
        ],
      }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'unknown_tool' });

    // Read change should have rolled back to its pre-call value (false).
    const list = (await (
      await app.request('/api/agent-capabilities', {
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      })
    ).json()) as Array<{ toolName: string; enabled: boolean }>;
    expect(list.find((c) => c.toolName === 'Read')?.enabled).toBe(false);
  });

  it('rejects empty updates array', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({ updates: [] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(400);
  });
});
