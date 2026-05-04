import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { CronRepo } from '../src/repos/crons';

let db: DB;
let repo: CronRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new CronRepo(db);
});

describe('CronRepo', () => {
  it('create + get round-trips a cron', () => {
    const created = repo.create({
      name: 'daily-hi',
      description: 'send hi every day',
      prompt: 'say hi to Alex',
      schedule: '0 9 * * *',
      source: 'chat',
      createdBy: 'U123',
      notifyConversationId: 'C1',
    });
    const fetched = repo.get(created.id);
    expect(fetched).toMatchObject({
      name: 'daily-hi',
      description: 'send hi every day',
      schedule: '0 9 * * *',
      enabled: true,
      source: 'chat',
      createdBy: 'U123',
      notifyConversationId: 'C1',
      notifyThreadId: null,
    });
  });

  it('update applies a partial patch and bumps updated_at', () => {
    const c = repo.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const updated = repo.update(c.id, { name: 'renamed', enabled: false });
    expect(updated.name).toBe('renamed');
    expect(updated.enabled).toBe(false);
  });

  it('list filters by enabled and source', () => {
    repo.create({ name: 'a', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    repo.create({ name: 'b', prompt: 'p', schedule: '* * * * *', source: 'static' });
    repo.create({ name: 'c', prompt: 'p', schedule: '* * * * *', source: 'chat', enabled: false });

    expect(repo.list().length).toBe(3);
    expect(repo.list({ source: 'chat' }).length).toBe(2);
    expect(repo.list({ source: 'static' }).length).toBe(1);
    expect(repo.list({ enabled: true }).length).toBe(2);
    expect(repo.list({ enabled: false }).length).toBe(1);
  });

  it('due returns only enabled crons whose next_run_at is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    repo.create({
      name: 'past-enabled',
      prompt: 'p',
      schedule: '*',
      source: 'chat',
      nextRunAt: past,
    });
    repo.create({
      name: 'future-enabled',
      prompt: 'p',
      schedule: '*',
      source: 'chat',
      nextRunAt: future,
    });
    repo.create({
      name: 'past-disabled',
      prompt: 'p',
      schedule: '*',
      source: 'chat',
      enabled: false,
      nextRunAt: past,
    });
    repo.create({ name: 'no-schedule', prompt: 'p', schedule: '*', source: 'chat' });

    const due = repo.due(new Date());
    expect(due.map((c) => c.name)).toEqual(['past-enabled']);
  });

  it('markRun sets last_run_at and next_run_at', () => {
    const c = repo.create({ name: 'x', prompt: 'p', schedule: '*', source: 'chat' });
    const last = new Date('2026-04-16T10:00:00Z');
    const next = new Date('2026-04-16T11:00:00Z');
    repo.markRun(c.id, last, next);
    const fetched = repo.get(c.id);
    expect(fetched?.lastRunAt).toBe(last.toISOString());
    expect(fetched?.nextRunAt).toBe(next.toISOString());
  });

  it('delete removes the cron', () => {
    const c = repo.create({ name: 'x', prompt: 'p', schedule: '*', source: 'chat' });
    repo.delete(c.id);
    expect(repo.get(c.id)).toBeNull();
  });

  it('replaceStaticSet swaps only static crons, keeps chat ones', () => {
    repo.create({ name: 'static-old', prompt: 'p', schedule: '*', source: 'static' });
    repo.create({ name: 'chat-keep', prompt: 'p', schedule: '*', source: 'chat' });
    repo.replaceStaticSet([{ name: 'static-new', prompt: 'p', schedule: '*', source: 'static' }]);
    const all = repo.list();
    expect(all.map((c) => c.name).sort()).toEqual(['chat-keep', 'static-new']);
  });
});
