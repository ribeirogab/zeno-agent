import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, type RuntimeDB, runRuntimeMigrations } from '../../../src/runtime/db.js';
import { SessionRepo } from '../../../src/runtime/repos/sessions.js';
import { sessions } from '../../../src/runtime/schema.js';

let db: RuntimeDB;
let close: () => void;
let repo: SessionRepo;

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  db = opened.drizzle;
  close = opened.close;
  repo = new SessionRepo(db);
});

afterEach(() => {
  close();
});

function insertSessionAt(database: RuntimeDB, threadId: string, lastUsedAt: string): void {
  database
    .insert(sessions)
    .values({
      threadId,
      sessionId: `sess_${threadId}`,
      createdAt: lastUsedAt,
      lastUsedAt,
    })
    .run();
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
