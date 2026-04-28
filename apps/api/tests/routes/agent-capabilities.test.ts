import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
  SkillRepo,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
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

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
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
    connectorRepo: new ConnectorRepo(database),
    skillRepo: new SkillRepo(database),
    connectorSkillRepo: new ConnectorSkillRepo(database),
    agentCapabilityRepo: new AgentCapabilityRepo(database),
    claudeHome: '/tmp',
    claudeHomeRoot: '/tmp',
    profileDir: '/tmp',
  });
}

describe('GET /api/agent-capabilities', () => {
  it('returns all 10 seeded tools — 9 disabled + ToolSearch enabled', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ toolName: string; enabled: boolean }>;
    expect(body).toHaveLength(10);
    for (const c of body) {
      expect(c.enabled).toBe(c.toolName === 'ToolSearch');
    }
    expect(body.map((c) => c.toolName).sort()).toEqual([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
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
      headers: authed(),
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
      headers: authed(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ toolName: string; enabled: boolean }>;
    const enabled = body
      .filter((c) => c.enabled)
      .map((c) => c.toolName)
      .sort();
    expect(enabled).toEqual(['Bash', 'Edit', 'Read', 'ToolSearch']);
  });

  it('returns 400 for unknown tool name and rolls back the whole batch', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({
        updates: [
          { toolName: 'Read', enabled: true },
          { toolName: 'NonexistentTool', enabled: true },
        ],
      }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'unknown_tool' });

    // Read change should have rolled back.
    const list = (await (
      await app.request('/api/agent-capabilities', { headers: authed() })
    ).json()) as Array<{ toolName: string; enabled: boolean }>;
    expect(list.find((c) => c.toolName === 'Read')?.enabled).toBe(false);
  });

  it('rejects empty updates array', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/agent-capabilities', {
      method: 'PATCH',
      body: JSON.stringify({ updates: [] }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
  });
});
