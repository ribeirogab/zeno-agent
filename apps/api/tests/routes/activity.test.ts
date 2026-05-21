import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
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
    claudeHome: '/tmp',
    profileDir: '/tmp',
    knowledgeRoot: '/tmp',
  });
}

describe('GET /api/activity', () => {
  it('returns empty array on empty db', async () => {
    const res = await makeApp(db).request('/api/activity', { headers: csrfHeaders() });
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
    const res = await makeApp(db).request('/api/activity', { headers: csrfHeaders() });
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
    const res = await makeApp(db).request('/api/activity?limit=3', { headers: csrfHeaders() });
    expect(((await res.json()) as unknown[]).length).toBe(3);
  });
});
