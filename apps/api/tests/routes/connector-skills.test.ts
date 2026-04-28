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

describe('GET /api/connectors/:id/skills', () => {
  it('returns 404 for unknown connector', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors/nonexistent/skills', { headers: authed() });
    expect(res.status).toBe(404);
  });

  it('returns empty list when no skills are linked', async () => {
    const c = new ConnectorRepo(db).create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
    const app = makeApp(db);
    const res = await app.request(`/api/connectors/${c.id}/skills`, { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns linked skills sorted by name', async () => {
    const connectors = new ConnectorRepo(db);
    const skills = new SkillRepo(db);
    const links = new ConnectorSkillRepo(db);
    const c = connectors.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
    const a = skills.create({ name: 'aws-debug', description: 'a', body: 'b' });
    const z = skills.create({ name: 'zeta-skill', description: 'z', body: 'b' });
    links.add(c.id, z.id);
    links.add(c.id, a.id);

    const app = makeApp(db);
    const res = await app.request(`/api/connectors/${c.id}/skills`, { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body.map((s) => s.name)).toEqual(['aws-debug', 'zeta-skill']);
  });
});

describe('PATCH /api/connectors/:id/skills', () => {
  it('replaces the link list atomically', async () => {
    const connectors = new ConnectorRepo(db);
    const skills = new SkillRepo(db);
    const c = connectors.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
    const a = skills.create({ name: 'a', description: 'd', body: 'b' });
    const b = skills.create({ name: 'b', description: 'd', body: 'b' });
    const cSkill = skills.create({ name: 'c', description: 'd', body: 'b' });

    const app = makeApp(db);
    let res = await app.request(`/api/connectors/${c.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [a.id, b.id] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);

    let listRes = await app.request(`/api/connectors/${c.id}/skills`, { headers: authed() });
    expect(((await listRes.json()) as Array<{ name: string }>).map((s) => s.name).sort()).toEqual([
      'a',
      'b',
    ]);

    // Replace with a different set: c + b (a removed).
    res = await app.request(`/api/connectors/${c.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [cSkill.id, b.id] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);
    listRes = await app.request(`/api/connectors/${c.id}/skills`, { headers: authed() });
    expect(((await listRes.json()) as Array<{ name: string }>).map((s) => s.name).sort()).toEqual([
      'b',
      'c',
    ]);
  });

  it('clears all links when given an empty array', async () => {
    const connectors = new ConnectorRepo(db);
    const skills = new SkillRepo(db);
    const links = new ConnectorSkillRepo(db);
    const c = connectors.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(c.id, s.id);

    const app = makeApp(db);
    const res = await app.request(`/api/connectors/${c.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);

    const listRes = await app.request(`/api/connectors/${c.id}/skills`, { headers: authed() });
    expect(await listRes.json()).toEqual([]);
  });

  it('returns 404 for unknown connector', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/connectors/nonexistent/skills', {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [] }),
      headers: authed(),
    });
    expect(res.status).toBe(404);
  });
});
