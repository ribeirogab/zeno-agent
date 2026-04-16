import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { LogRepo } from '../src/repos/logs.js';
import type { CreateLogInput } from '../src/types.js';

let db: DB;
let repo: LogRepo;

function sample(overrides: Partial<CreateLogInput> = {}): CreateLogInput {
  return {
    ts: '2026-04-16T12:00:00.000Z',
    level: 30,
    service: 'worker',
    event: 'boot',
    correlationId: null,
    message: 'zeno booting',
    payload: JSON.stringify({
      level: 30,
      time: '2026-04-16T12:00:00.000Z',
      service: 'worker',
      event: 'boot',
      msg: 'zeno booting',
    }),
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new LogRepo(db);
});

describe('LogRepo.insert + list', () => {
  it('inserts and returns rows newest-first', () => {
    repo.insert(sample({ event: 'first', ts: '2026-04-16T12:00:01.000Z' }));
    repo.insert(sample({ event: 'second', ts: '2026-04-16T12:00:02.000Z' }));
    const { logs, nextCursorId } = repo.list({});
    expect(logs).toHaveLength(2);
    expect(logs[0]?.event).toBe('second');
    expect(logs[1]?.event).toBe('first');
    expect(nextCursorId).toBeNull();
  });

  it('filters by level', () => {
    repo.insert(sample({ level: 30, event: 'info-x' }));
    repo.insert(sample({ level: 50, event: 'err-x' }));
    const { logs } = repo.list({ level: 50 });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('err-x');
  });

  it('q matches event prefix case-insensitive', () => {
    repo.insert(sample({ event: 'cron_run_success' }));
    repo.insert(sample({ event: 'CRON_RUN_FAILED' }));
    repo.insert(sample({ event: 'other_thing' }));
    const { logs } = repo.list({ q: 'cron_run' });
    expect(logs.map((l) => l.event).sort()).toEqual(['CRON_RUN_FAILED', 'cron_run_success']);
  });

  it('q matches correlation_id exact (case-sensitive)', () => {
    repo.insert(sample({ correlationId: 'corr-ABC-123', event: 'a' }));
    repo.insert(sample({ correlationId: 'corr-XYZ-000', event: 'b' }));
    const { logs } = repo.list({ q: 'corr-ABC-123' });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('a');
  });

  it('honors since/until range', () => {
    repo.insert(sample({ ts: '2026-04-10T00:00:00.000Z', event: 'old' }));
    repo.insert(sample({ ts: '2026-04-16T12:00:00.000Z', event: 'recent' }));
    const { logs } = repo.list({ since: '2026-04-15T00:00:00.000Z' });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('recent');
  });

  it('returns nextCursorId when limit is hit', () => {
    for (let i = 0; i < 5; i += 1) {
      repo.insert(sample({ event: `e-${i}`, ts: `2026-04-16T12:00:0${i}.000Z` }));
    }
    const first = repo.list({ limit: 3 });
    expect(first.logs).toHaveLength(3);
    expect(first.nextCursorId).toBe(first.logs[2]?.id);
    const second = repo.list({ limit: 3, cursorId: first.nextCursorId ?? undefined });
    expect(second.logs).toHaveLength(2);
    expect(second.nextCursorId).toBeNull();
  });
});

describe('LogRepo.listSince', () => {
  it('returns rows with id > sinceId in ascending order', () => {
    repo.insert(sample({ event: 'a' }));
    const snapshot = repo.list({}).logs[0];
    const sinceId = snapshot?.id ?? 0;
    repo.insert(sample({ event: 'b' }));
    repo.insert(sample({ event: 'c' }));
    const rows = repo.listSince({ sinceId });
    expect(rows.map((l) => l.event)).toEqual(['b', 'c']);
  });

  it('applies filters while streaming', () => {
    repo.insert(sample({ level: 30, event: 'noise' }));
    const firstId = repo.list({}).logs[0]?.id ?? 0;
    repo.insert(sample({ level: 50, event: 'boom' }));
    const rows = repo.listSince({ sinceId: firstId, level: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event).toBe('boom');
  });
});

describe('LogRepo.sweep', () => {
  it('deletes rows older than threshold and returns count', () => {
    repo.insert(sample({ ts: '2026-03-01T00:00:00.000Z', event: 'stale-1' }));
    repo.insert(sample({ ts: '2026-03-02T00:00:00.000Z', event: 'stale-2' }));
    repo.insert(sample({ ts: '2026-04-16T00:00:00.000Z', event: 'fresh' }));
    const deleted = repo.sweep('2026-04-01T00:00:00.000Z');
    expect(deleted).toBe(2);
    const remaining = repo.list({}).logs.map((l) => l.event);
    expect(remaining).toEqual(['fresh']);
  });

  it('returns 0 when nothing to delete', () => {
    repo.insert(sample({ ts: '2026-04-16T12:00:00.000Z' }));
    expect(repo.sweep('2026-04-10T00:00:00.000Z')).toBe(0);
  });
});

describe('LogRepo id monotonicity after sweep', () => {
  it('assigns strictly increasing ids even after DELETE (AUTOINCREMENT)', () => {
    repo.insert(sample({ event: 'a', ts: '2026-03-01T00:00:00.000Z' }));
    const firstId = repo.list({}).logs[0]?.id ?? 0;
    repo.sweep('2026-04-01T00:00:00.000Z');
    repo.insert(sample({ event: 'b', ts: '2026-04-16T12:00:00.000Z' }));
    const nextId = repo.list({}).logs[0]?.id ?? 0;
    expect(nextId).toBeGreaterThan(firstId);
  });
});
