import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../../src/db';
import { runMigrations } from '../../src/migrations';
import { CronRepo } from '../../src/repos/crons';

let db: DB;
let repo: CronRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new CronRepo(db);
});

describe('CronRepo.next', () => {
  it('returns empty array when no crons exist', () => {
    expect(repo.next()).toEqual([]);
  });

  it('returns empty array when no enabled crons have next_run_at', () => {
    repo.create({ name: 'a', prompt: 'p', schedule: '*', source: 'chat' });
    expect(repo.next()).toEqual([]);
  });

  it('returns only enabled crons with next_run_at', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    repo.create({ name: 'enabled-with-next', prompt: 'p', schedule: '*', source: 'chat', nextRunAt: future });
    repo.create({ name: 'enabled-without-next', prompt: 'p', schedule: '*', source: 'chat' });

    const result = repo.next();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enabled-with-next');
  });

  it('excludes disabled crons', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    repo.create({ name: 'disabled', prompt: 'p', schedule: '*', source: 'chat', enabled: false, nextRunAt: future });
    repo.create({ name: 'enabled', prompt: 'p', schedule: '*', source: 'chat', nextRunAt: future });

    const result = repo.next();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enabled');
  });

  it('orders by next_run_at ASC', () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    const later = new Date(Date.now() + 120_000).toISOString();
    const latest = new Date(Date.now() + 180_000).toISOString();

    repo.create({ name: 'latest', prompt: 'p', schedule: '*', source: 'chat', nextRunAt: latest });
    repo.create({ name: 'soon', prompt: 'p', schedule: '*', source: 'chat', nextRunAt: soon });
    repo.create({ name: 'later', prompt: 'p', schedule: '*', source: 'chat', nextRunAt: later });

    const result = repo.next(10);
    expect(result.map((c) => c.name)).toEqual(['soon', 'later', 'latest']);
  });

  it('respects limit parameter', () => {
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      const nextRunAt = new Date(base + (i + 1) * 60_000).toISOString();
      repo.create({ name: `cron-${i}`, prompt: 'p', schedule: '*', source: 'chat', nextRunAt });
    }

    expect(repo.next(2)).toHaveLength(2);
    expect(repo.next(3)).toHaveLength(3);
    expect(repo.next()).toHaveLength(3);
  });

  it('excludes crons without next_run_at', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    repo.create({ name: 'with-next', prompt: 'p', schedule: '*', source: 'chat', nextRunAt: future });
    repo.create({ name: 'without-next', prompt: 'p', schedule: '*', source: 'chat' });

    const result = repo.next(10);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('with-next');
  });
});
