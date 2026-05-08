import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
  SessionRepo,
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
  });
}

describe('GET /api/stats', () => {
  it('returns zero counts on empty db', async () => {
    const res = await makeApp(db).request('/api/stats', { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ activeCrons: 0, sessions24h: 0, runsToday: 0, failures24h: 0 });
  });

  it('counts active crons (enabled=1)', async () => {
    const crons = new CronRepo(db);
    crons.create({ name: 'a', prompt: 'x', schedule: '* * * * *', source: 'chat', enabled: true });
    crons.create({ name: 'b', prompt: 'x', schedule: '* * * * *', source: 'chat', enabled: false });
    crons.create({ name: 'c', prompt: 'x', schedule: '* * * * *', source: 'chat', enabled: true });
    const res = await makeApp(db).request('/api/stats', { headers: csrfHeaders() });
    const body = (await res.json()) as { activeCrons: number };
    expect(body.activeCrons).toBe(2);
  });

  it('counts sessions in last 24h via last_used_at', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-recent', 'sess-1');
    opened.raw
      .prepare(
        "UPDATE sessions SET last_used_at = datetime('now', '-2 days') WHERE thread_id = 'thread-recent'",
      )
      .run();
    sessions.upsert('thread-fresh', 'sess-2');
    const res = await makeApp(db).request('/api/stats', { headers: csrfHeaders() });
    const body = (await res.json()) as { sessions24h: number };
    expect(body.sessions24h).toBe(1);
  });

  it('counts cron runs from today and failures in last 24h', async () => {
    const cronRuns = new CronRunRepo(db);
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const run1 = cronRuns.start(cron.id);
    cronRuns.finish(run1.id, 'success', 'ok');
    const run2 = cronRuns.start(cron.id);
    cronRuns.finish(run2.id, 'failed', null, 'boom');
    const res = await makeApp(db).request('/api/stats', { headers: csrfHeaders() });
    const body = (await res.json()) as { runsToday: number; failures24h: number };
    expect(body.runsToday).toBe(2);
    expect(body.failures24h).toBe(1);
  });
});
