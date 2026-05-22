import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../../src/runtime/db.js';
import { CronRepo, type UpsertCronInput } from '../../../src/runtime/repos/crons.js';

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

describe('CronRepo.next', () => {
  it('returns empty array when no crons exist', () => {
    expect(repo.next()).toEqual([]);
  });

  it('returns empty array when no enabled crons have next_run_at', () => {
    repo.upsertFromFile(input('a'));
    expect(repo.next()).toEqual([]);
  });

  it('returns only enabled crons with next_run_at', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    repo.upsertFromFile(input('enabled-with-next', { nextRunAt: future }));
    repo.upsertFromFile(input('enabled-without-next'));

    const result = repo.next();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('enabled-with-next');
  });

  it('excludes disabled crons', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    repo.upsertFromFile(input('disabled', { enabled: false, nextRunAt: future }));
    repo.upsertFromFile(input('enabled', { nextRunAt: future }));

    const result = repo.next();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('enabled');
  });

  it('orders by next_run_at ASC', () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    const later = new Date(Date.now() + 120_000).toISOString();
    const latest = new Date(Date.now() + 180_000).toISOString();

    repo.upsertFromFile(input('latest', { nextRunAt: latest }));
    repo.upsertFromFile(input('soon', { nextRunAt: soon }));
    repo.upsertFromFile(input('later', { nextRunAt: later }));

    const result = repo.next(10);
    expect(result.map((c) => c.id)).toEqual(['soon', 'later', 'latest']);
  });

  it('respects limit parameter', () => {
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      const nextRunAt = new Date(base + (i + 1) * 60_000).toISOString();
      repo.upsertFromFile(input(`cron-${i}`, { nextRunAt }));
    }

    expect(repo.next(2)).toHaveLength(2);
    expect(repo.next(3)).toHaveLength(3);
    expect(repo.next()).toHaveLength(3);
  });

  it('excludes crons without next_run_at', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    repo.upsertFromFile(input('with-next', { nextRunAt: future }));
    repo.upsertFromFile(input('without-next'));

    const result = repo.next(10);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('with-next');
  });
});
