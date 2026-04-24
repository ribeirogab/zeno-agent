import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../../src/db';
import { runMigrations } from '../../src/migrations';
import { SessionRepo } from '../../src/repos/sessions';

let db: DB;
let repo: SessionRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new SessionRepo(db);
});

function insertSessionAt(db: DB, threadId: string, lastUsedAt: string): void {
  db.prepare(
    'INSERT INTO sessions (thread_id, session_id, created_at, last_used_at) VALUES (?, ?, ?, ?)',
  ).run(threadId, `sess_${threadId}`, lastUsedAt, lastUsedAt);
}

function hourKey(hoursAgo: number): string {
  const d = new Date(Date.now() - hoursAgo * 3600_000);
  return `${d.toISOString().slice(0, 13)}:00:00Z`;
}

describe('SessionRepo.sparkline', () => {
  it('returns 24 zero-count buckets when no data exists', () => {
    const result = repo.sparkline();
    expect(result).toHaveLength(24);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it('counts sessions in the correct hour bucket', () => {
    const thisHour = hourKey(0);
    const threeHoursAgo = hourKey(3);

    insertSessionAt(db, 't1', thisHour);
    insertSessionAt(db, 't2', thisHour);
    insertSessionAt(db, 't3', threeHoursAgo);

    const result = repo.sparkline();
    const current = result.find((b) => b.hour === thisHour);
    const atThree = result.find((b) => b.hour === threeHoursAgo);
    expect(current?.count).toBe(2);
    expect(atThree?.count).toBe(1);
  });

  it('respects custom hours parameter', () => {
    const result = repo.sparkline(12);
    expect(result).toHaveLength(12);
  });

  it('fills empty hours with 0', () => {
    const thisHour = hourKey(0);
    insertSessionAt(db, 't1', thisHour);

    const result = repo.sparkline();
    const nonZero = result.filter((b) => b.count > 0);
    const zeroes = result.filter((b) => b.count === 0);
    expect(nonZero).toHaveLength(1);
    expect(zeroes).toHaveLength(23);
  });

  it('returns buckets ordered from oldest to newest', () => {
    const result = repo.sparkline();
    for (let i = 1; i < result.length; i++) {
      expect(result[i].hour >= result[i - 1].hour).toBe(true);
    }
  });
});
