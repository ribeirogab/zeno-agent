import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
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
    cronSkillRepo: new CronSkillRepo(database),
    cronConnectorRepo: new CronConnectorRepo(database),
    agentCapabilityRepo: new AgentCapabilityRepo(database),
    claudeHome: '/tmp',
    claudeHomeRoot: '/tmp',
    profileDir: '/tmp',
  });
}

function seedCron(database: DB, name: string) {
  return new CronRepo(database).create({
    name,
    prompt: 'p',
    schedule: '0 9 * * *',
    source: 'chat',
  });
}

function seedConnector(database: DB, slug: string) {
  return new ConnectorRepo(database).create({
    slug,
    displayName: slug,
    source: 'catalog',
    catalogId: slug,
    transport: 'remote',
    url: 'https://x',
    tools: [],
    secrets: [],
  });
}

describe('GET /api/crons/:id/connectors', () => {
  it('returns 404 for unknown cron', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/crons/nonexistent/connectors', { headers: authed() });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('cron_not_found');
  });

  it('returns empty list when no connectors are linked', async () => {
    const cron = seedCron(db, 'my-cron');
    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns linked connectors sorted by slug', async () => {
    const cron = seedCron(db, 'cron');
    const links = new CronConnectorRepo(db);
    const linear = seedConnector(db, 'linear');
    const sentry = seedConnector(db, 'sentry');
    const github = seedConnector(db, 'github');
    links.add(cron.id, linear.id);
    links.add(cron.id, sentry.id);
    links.add(cron.id, github.id);

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ slug: string }>;
    expect(body.map((c) => c.slug)).toEqual(['github', 'linear', 'sentry']);
  });

  it('linked connector payload contains id, slug, displayName, status', async () => {
    const cron = seedCron(db, 'cron');
    const links = new CronConnectorRepo(db);
    const c = seedConnector(db, 'linear');
    links.add(cron.id, c.id);

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    const body = (await res.json()) as Array<{
      id: string;
      slug: string;
      displayName: string;
      status: string;
    }>;
    expect(body[0]).toMatchObject({ id: c.id, slug: 'linear' });
    expect(typeof body[0]?.displayName).toBe('string');
    expect(typeof body[0]?.status).toBe('string');
  });
});

describe('PATCH /api/crons/:id/connectors', () => {
  it('replaces the link list atomically', async () => {
    const cron = seedCron(db, 'cron');
    const a = seedConnector(db, 'a');
    const b = seedConnector(db, 'b');
    const c = seedConnector(db, 'c');

    const app = makeApp(db);
    let res = await app.request(`/api/crons/${cron.id}/connectors`, {
      method: 'PATCH',
      body: JSON.stringify({ connectorIds: [a.id, b.id] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);

    let listRes = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    expect(((await listRes.json()) as Array<{ slug: string }>).map((c) => c.slug).sort()).toEqual([
      'a',
      'b',
    ]);

    res = await app.request(`/api/crons/${cron.id}/connectors`, {
      method: 'PATCH',
      body: JSON.stringify({ connectorIds: [c.id, b.id] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);
    listRes = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    expect(((await listRes.json()) as Array<{ slug: string }>).map((c) => c.slug).sort()).toEqual([
      'b',
      'c',
    ]);
  });

  it('clears all links when given an empty array', async () => {
    const cron = seedCron(db, 'cron');
    const links = new CronConnectorRepo(db);
    const c = seedConnector(db, 'c');
    links.add(cron.id, c.id);

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/connectors`, {
      method: 'PATCH',
      body: JSON.stringify({ connectorIds: [] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);

    const listRes = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    expect(await listRes.json()).toEqual([]);
  });

  it('returns 404 for unknown cron', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/crons/nonexistent/connectors', {
      method: 'PATCH',
      body: JSON.stringify({ connectorIds: [] }),
      headers: authed(),
    });
    expect(res.status).toBe(404);
  });

  it('silently skips connector ids that do not exist', async () => {
    const cron = seedCron(db, 'cron');
    const real = seedConnector(db, 'real');

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/connectors`, {
      method: 'PATCH',
      body: JSON.stringify({ connectorIds: [real.id, 'fake-id'] }),
      headers: authed(),
    });
    expect(res.status).toBe(204);

    const listRes = await app.request(`/api/crons/${cron.id}/connectors`, { headers: authed() });
    const body = (await listRes.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(real.id);
  });
});
