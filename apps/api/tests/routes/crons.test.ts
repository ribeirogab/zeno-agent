import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
});

function makeApp(database: DB) {
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

describe('GET /api/crons', () => {
  it('returns empty list on empty db', async () => {
    const res = await makeApp(db).request('/api/crons', { headers: csrfHeaders() });
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
    const res = await makeApp(db).request('/api/crons', { headers: csrfHeaders() });
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
    const res = await makeApp(db).request('/api/crons?enabled=true', { headers: csrfHeaders() });
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
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, { headers: csrfHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cron: { id: string };
      recentRuns: Array<{ id: string }>;
    };
    expect(body.cron.id).toBe(cron.id);
    expect(body.recentRuns).toHaveLength(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await makeApp(db).request('/api/crons/nope', { headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/crons', () => {
  it('enqueues cron_create command', async () => {
    const commands = new CommandRepo(db);
    const res = await makeApp(db).request('/api/crons', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'new-one',
        prompt: 'hi',
        schedule: '0 9 * * *',
      }),
    });
    expect(res.status).toBe(204);
    const pending = commands.claimPending(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe('cron_create');
  });

  it('rejects invalid body', async () => {
    const res = await makeApp(db).request('/api/crons', {
      method: 'POST',
      headers: { ...csrfHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/crons/:id/pause', () => {
  it('enqueues cron_pause', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}/pause`, {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('cron_pause');
  });

  it('returns 404 if cron does not exist', async () => {
    const res = await makeApp(db).request('/api/crons/missing/pause', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/crons/:id/resume', () => {
  it('enqueues cron_resume', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}/resume`, {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('cron_resume');
  });

  it('returns 404 if cron does not exist', async () => {
    const res = await makeApp(db).request('/api/crons/missing/resume', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/crons/:id/run-now', () => {
  it('enqueues cron_run_now', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}/run-now`, {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('cron_run_now');
  });

  it('returns 404 if cron does not exist', async () => {
    const res = await makeApp(db).request('/api/crons/missing/run-now', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/crons/:id', () => {
  it('refuses static crons with 409', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'static' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(409);
  });

  it('enqueues cron_delete for chat crons', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('cron_delete');
  });
});
