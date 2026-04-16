import { CronRepo, CronRunRepo, type DB, openDatabase, runMigrations } from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/crons', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/crons');
    expect(res.status).toBe(401);
  });

  it('returns empty list on empty db', async () => {
    const res = await makeApp(db).request('/api/crons', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns all crons ordered by created_at desc', async () => {
    const crons = new CronRepo(db);
    const first = crons.create({
      name: 'first',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const second = crons.create({
      name: 'second',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    // SQLite CURRENT_TIMESTAMP has second-level resolution; force distinct times
    // so the ORDER BY created_at DESC ordering is deterministic.
    db.prepare("UPDATE crons SET created_at = datetime('now','-1 minute') WHERE id = ?").run(
      first.id,
    );
    db.prepare("UPDATE crons SET created_at = datetime('now') WHERE id = ?").run(second.id);
    const res = await makeApp(db).request('/api/crons', { headers: authed() });
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.name).toBe('second');
  });

  it('filters by enabled=true', async () => {
    const crons = new CronRepo(db);
    crons.create({
      name: 'on',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
      enabled: true,
    });
    crons.create({
      name: 'off',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
      enabled: false,
    });
    const res = await makeApp(db).request('/api/crons?enabled=true', { headers: authed() });
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.name).toBe('on');
  });
});

describe('GET /api/crons/:id', () => {
  it('returns cron + recent runs', async () => {
    const crons = new CronRepo(db);
    const runs = new CronRunRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const run = runs.start(cron.id);
    runs.finish(run.id, 'success', 'ok');
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cron: { id: string };
      recentRuns: Array<{ id: string }>;
    };
    expect(body.cron.id).toBe(cron.id);
    expect(body.recentRuns).toHaveLength(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await makeApp(db).request('/api/crons/nope', { headers: authed() });
    expect(res.status).toBe(404);
  });
});
