import { type DB, LogRepo, openDatabase, runMigrations } from '@zeno/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogsRetention } from '@/logs/retention';

let db: DB;
let repo: LogRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new LogRepo(db);
});

function insertOldLog(): void {
  repo.insert({
    ts: '2026-03-01T00:00:00.000Z',
    level: 30,
    service: 'worker',
    event: 'ancient',
    correlationId: null,
    message: 'ancient',
    payload: '{}',
  });
}

describe('LogsRetention', () => {
  it('sweeps on start()', () => {
    insertOldLog();
    const now = new Date('2026-04-16T00:00:00.000Z');
    const retention = new LogsRetention({ logRepo: repo, retentionDays: 7, now: () => now });
    retention.start();
    retention.stop();
    expect(repo.list({}).logs).toHaveLength(0);
  });

  it('schedules a daily interval after the initial sweep', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-16T00:00:00.000Z');
    const retention = new LogsRetention({ logRepo: repo, retentionDays: 7, now: () => now });
    retention.start();
    insertOldLog();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    retention.stop();
    vi.useRealTimers();
    expect(repo.list({}).logs).toHaveLength(0);
  });

  it('stop() prevents further sweeps', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-16T00:00:00.000Z');
    const retention = new LogsRetention({ logRepo: repo, retentionDays: 7, now: () => now });
    retention.start();
    retention.stop();
    insertOldLog();
    vi.advanceTimersByTime(48 * 60 * 60 * 1000);
    vi.useRealTimers();
    expect(repo.list({}).logs).toHaveLength(1);
  });
});
