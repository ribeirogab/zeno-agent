import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
  SkillRepo,
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
    cronSkillRepo: new CronSkillRepo(database),
    cronConnectorRepo: new CronConnectorRepo(database),
    agentCapabilityRepo: new AgentCapabilityRepo(database),
    claudeHome: '/tmp',
    claudeHomeRoot: '/tmp',
    profileDir: '/tmp',
    knowledgeRoot: '/tmp',
  });
}

function seedCron(database: RuntimeDB, name: string) {
  return new CronRepo(database).create({
    name,
    prompt: 'p',
    schedule: '0 9 * * *',
    source: 'chat',
  });
}

describe('GET /api/crons/:id/skills', () => {
  it('returns 404 for unknown cron', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/crons/nonexistent/skills', {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('cron_not_found');
  });

  it('returns empty list when no skills are linked', async () => {
    const cron = seedCron(db, 'my-cron');
    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns linked skills sorted by name', async () => {
    const cron = seedCron(db, 'cron');
    const skills = new SkillRepo(db);
    const links = new CronSkillRepo(db);
    const a = skills.create({ name: 'aws-debug', description: 'a', body: 'b' });
    const z = skills.create({ name: 'zeta-skill', description: 'z', body: 'b' });
    links.add(cron.id, z.id);
    links.add(cron.id, a.id);

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body.map((s) => s.name)).toEqual(['aws-debug', 'zeta-skill']);
  });

  it('linked skill payload contains id, name, description, updatedAt', async () => {
    const cron = seedCron(db, 'cron');
    const skills = new SkillRepo(db);
    const links = new CronSkillRepo(db);
    const s = skills.create({ name: 's1', description: 'desc-text', body: 'b' });
    links.add(cron.id, s.id);

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    const body = (await res.json()) as Array<{
      id: string;
      name: string;
      description: string;
      updatedAt: string;
    }>;
    expect(body[0]).toMatchObject({ id: s.id, name: 's1', description: 'desc-text' });
    expect(typeof body[0]?.updatedAt).toBe('string');
  });
});

describe('PATCH /api/crons/:id/skills', () => {
  it('replaces the link list atomically', async () => {
    const cron = seedCron(db, 'cron');
    const skills = new SkillRepo(db);
    const a = skills.create({ name: 'a', description: 'd', body: 'b' });
    const b = skills.create({ name: 'b', description: 'd', body: 'b' });
    const c = skills.create({ name: 'c', description: 'd', body: 'b' });

    const app = makeApp(db);
    let res = await app.request(`/api/crons/${cron.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [a.id, b.id] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(204);

    let listRes = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(((await listRes.json()) as Array<{ name: string }>).map((s) => s.name).sort()).toEqual([
      'a',
      'b',
    ]);

    // Replace with [c, b] (a removed).
    res = await app.request(`/api/crons/${cron.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [c.id, b.id] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(204);
    listRes = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(((await listRes.json()) as Array<{ name: string }>).map((s) => s.name).sort()).toEqual([
      'b',
      'c',
    ]);
  });

  it('clears all links when given an empty array', async () => {
    const cron = seedCron(db, 'cron');
    const skills = new SkillRepo(db);
    const links = new CronSkillRepo(db);
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(cron.id, s.id);

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(204);

    const listRes = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(await listRes.json()).toEqual([]);
  });

  it('returns 404 for unknown cron', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/crons/nonexistent/skills', {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(404);
  });

  it('silently skips skill ids that do not exist', async () => {
    const cron = seedCron(db, 'cron');
    const skills = new SkillRepo(db);
    const real = skills.create({ name: 'real', description: 'd', body: 'b' });

    const app = makeApp(db);
    const res = await app.request(`/api/crons/${cron.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [real.id, 'fake-id', 'another-fake'] }),
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    expect(res.status).toBe(204);

    const listRes = await app.request(`/api/crons/${cron.id}/skills`, {
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    });
    const body = (await listRes.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(real.id);
  });
});
