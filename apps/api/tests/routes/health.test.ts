import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: '0'.repeat(64),
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    claudeHome: '/tmp',
  });
}

describe('GET /api/health', () => {
  it('returns ok with all-unknown statuses on empty db', async () => {
    const res = await makeApp(db).request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      services: {
        backend: 'unknown',
        slack: 'unknown',
        runner: 'idle',
      },
      lastTickAt: null,
    });
  });

  it('reports runner=ticking when a cron_run started in last 90s', async () => {
    const crons = new CronRepo(db);
    const runs = new CronRunRepo(db);
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    runs.start(cron.id);
    const res = await makeApp(db).request('/api/health');
    const body = (await res.json()) as {
      services: { runner: string };
      lastTickAt: string | null;
    };
    expect(body.services.runner).toBe('ticking');
    expect(body.lastTickAt).not.toBeNull();
  });

  it('reports runner=stale when most recent run is older than 90s', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    db.prepare(
      "INSERT INTO cron_runs (id, cron_id, started_at, status) VALUES (?, ?, datetime('now','-5 minutes'), 'success')",
    ).run('r1', cron.id);
    const res = await makeApp(db).request('/api/health');
    const body = (await res.json()) as { services: { runner: string } };
    expect(body.services.runner).toBe('stale');
  });
});
