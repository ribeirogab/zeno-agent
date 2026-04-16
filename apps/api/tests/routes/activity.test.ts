import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
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
    commandRepo: new CommandRepo(database),
  });
}

function authedHeaders(): { Cookie: string } {
  const cookie = signSession(SECRET, Date.now() + 60_000);
  return { Cookie: `${COOKIE_NAME}=${cookie}` };
}

describe('GET /api/activity', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/activity');
    expect(res.status).toBe(401);
  });

  it('returns empty array on empty db', async () => {
    const res = await makeApp(db).request('/api/activity', { headers: authedHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns recent cron_runs joined with cron name, default limit 10', async () => {
    const crons = new CronRepo(db);
    const runs = new CronRunRepo(db);
    const cron = crons.create({
      name: 'morning-summary',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    for (let i = 0; i < 12; i += 1) {
      const r = runs.start(cron.id);
      runs.finish(r.id, i % 4 === 0 ? 'failed' : 'success', `out-${i}`, i % 4 === 0 ? 'err' : null);
    }
    const res = await makeApp(db).request('/api/activity', { headers: authedHeaders() });
    const body = (await res.json()) as Array<{
      id: string;
      kind: string;
      timestamp: string;
      summary: string;
      status: string;
    }>;
    expect(body).toHaveLength(10);
    expect(body[0]?.kind).toBe('cron_run');
    expect(body[0]?.summary).toContain('morning-summary');
  });

  it('honors ?limit query', async () => {
    const crons = new CronRepo(db);
    const runs = new CronRunRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    for (let i = 0; i < 5; i += 1) runs.start(cron.id);
    const res = await makeApp(db).request('/api/activity?limit=3', { headers: authedHeaders() });
    expect(((await res.json()) as unknown[]).length).toBe(3);
  });
});
