import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';
import { CronRepo, type UpsertCronInput } from '../../src/runtime/repos/crons.js';

let close: () => void;
let repo: CronRepo;

function input(slug: string, overrides: Partial<UpsertCronInput> = {}): UpsertCronInput {
  return {
    slug,
    name: slug,
    description: null,
    schedule: '* * * * *',
    enabled: true,
    contentHash: 'h',
    mtimeMs: 1,
    nextRunAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  close = opened.close;
  repo = new CronRepo(opened.drizzle);
});

afterEach(() => {
  close();
});

describe('CronRepo', () => {
  it('upsertFromFile inserts and reads back', () => {
    const created = repo.upsertFromFile(
      input('daily-hi', {
        name: 'daily-hi',
        description: 'send hi every day',
        schedule: '0 9 * * *',
      }),
    );
    const fetched = repo.get(created.id);
    expect(fetched).toMatchObject({
      id: 'daily-hi',
      name: 'daily-hi',
      description: 'send hi every day',
      schedule: '0 9 * * *',
      enabled: true,
      lastError: null,
    });
  });

  it('upsertFromFile updates on conflict (same slug)', () => {
    repo.upsertFromFile(input('x', { name: 'first', enabled: true }));
    repo.upsertFromFile(
      input('x', { name: 'second', enabled: false, contentHash: 'h2', mtimeMs: 5 }),
    );
    const row = repo.get('x');
    expect(row?.name).toBe('second');
    expect(row?.enabled).toBe(false);
    expect(row?.contentHash).toBe('h2');
    expect(row?.mtimeMs).toBe(5);
  });

  it('list filters by enabled', () => {
    repo.upsertFromFile(input('a', { enabled: true }));
    repo.upsertFromFile(input('b', { enabled: false }));
    expect(repo.list().length).toBe(2);
    expect(repo.list({ enabled: true }).length).toBe(1);
    expect(repo.list({ enabled: false }).length).toBe(1);
  });

  it('markFailed stores lastError and disables the row', () => {
    repo.upsertFromFile(input('broken'));
    repo.markFailed('broken', 'invalid_schedule: foo');
    const row = repo.get('broken');
    expect(row?.enabled).toBe(false);
    expect(row?.lastError).toBe('invalid_schedule: foo');
    expect(row?.lastErrorAt).not.toBeNull();
  });

  it('markFailed creates a stub row when the slug does not exist yet', () => {
    repo.markFailed('never-seen', 'missing_name');
    const row = repo.get('never-seen');
    expect(row).not.toBeNull();
    expect(row?.enabled).toBe(false);
    expect(row?.lastError).toBe('missing_name');
  });

  it('markRun sets last_run_at and next_run_at', () => {
    repo.upsertFromFile(input('x'));
    const last = new Date('2026-04-16T10:00:00Z');
    const next = new Date('2026-04-16T11:00:00Z');
    repo.markRun('x', last, next);
    const fetched = repo.get('x');
    expect(fetched?.lastRunAt).toBe(last.toISOString());
    expect(fetched?.nextRunAt).toBe(next.toISOString());
  });

  it('delete removes the cron', () => {
    repo.upsertFromFile(input('x'));
    repo.delete('x');
    expect(repo.get('x')).toBeNull();
  });
});
