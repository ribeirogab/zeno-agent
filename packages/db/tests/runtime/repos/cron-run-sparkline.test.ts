import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '../../../src/runtime/db.js';
import { CronRunRepo } from '../../../src/runtime/repos/cron-runs.js';
import { CronRepo } from '../../../src/runtime/repos/crons.js';
import { cronRuns } from '../../../src/runtime/schema.js';

let db: RuntimeDB;
let close: () => void;
let cronRepo: CronRepo;
let runRepo: CronRunRepo;
let cronId: string;

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  db = opened.drizzle;
  close = opened.close;
  cronRepo = new CronRepo(db);
  runRepo = new CronRunRepo(db);
  const cron = cronRepo.upsertFromFile({
    slug: 'x',
    name: 'x',
    description: null,
    schedule: '* * * * *',
    enabled: true,
    contentHash: 'h',
    mtimeMs: 1,
    nextRunAt: null,
  });
  cronId = cron.id;
});

afterEach(() => {
  close();
});

function insertRunAt(
  database: RuntimeDB,
  cronIdValue: string,
  startedAt: string,
  status = 'success',
): void {
  database
    .insert(cronRuns)
    .values({
      id: crypto.randomUUID(),
      cronId: cronIdValue,
      startedAt,
      status,
    })
    .run();
}

function hourKey(hoursAgo: number): string {
  const d = new Date(Date.now() - hoursAgo * 3600_000);
  return `${d.toISOString().slice(0, 13)}:00:00Z`;
}

describe('CronRunRepo.sparkline', () => {
  it('returns 24 zero-count buckets when no data exists', () => {
    const result = runRepo.sparkline('runs');
    expect(result).toHaveLength(24);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it('counts all runs for the "runs" metric', () => {
    const thisHour = hourKey(0);
    insertRunAt(db, cronId, thisHour, 'success');
    insertRunAt(db, cronId, thisHour, 'failed');
    insertRunAt(db, cronId, thisHour, 'running');

    const result = runRepo.sparkline('runs');
    const current = result.find((b) => b.hour === thisHour);
    expect(current?.count).toBe(3);
  });

  it('counts only failed runs for the "failures" metric', () => {
    const thisHour = hourKey(0);
    insertRunAt(db, cronId, thisHour, 'success');
    insertRunAt(db, cronId, thisHour, 'failed');
    insertRunAt(db, cronId, thisHour, 'failed');

    const result = runRepo.sparkline('failures');
    const current = result.find((b) => b.hour === thisHour);
    expect(current?.count).toBe(2);
  });

  it('places runs into the correct hour bucket', () => {
    const twoHoursAgo = hourKey(2);
    const fiveHoursAgo = hourKey(5);
    insertRunAt(db, cronId, twoHoursAgo, 'success');
    insertRunAt(db, cronId, fiveHoursAgo, 'success');
    insertRunAt(db, cronId, fiveHoursAgo, 'success');

    const result = runRepo.sparkline('runs');
    const atTwo = result.find((b) => b.hour === twoHoursAgo);
    const atFive = result.find((b) => b.hour === fiveHoursAgo);
    expect(atTwo?.count).toBe(1);
    expect(atFive?.count).toBe(2);
  });

  it('respects custom hours parameter', () => {
    const result = runRepo.sparkline('runs', 6);
    expect(result).toHaveLength(6);
  });

  it('fills empty hours with 0', () => {
    const thisHour = hourKey(0);
    insertRunAt(db, cronId, thisHour, 'success');

    const result = runRepo.sparkline('runs');
    const nonZero = result.filter((b) => b.count > 0);
    const zeroes = result.filter((b) => b.count === 0);
    expect(nonZero).toHaveLength(1);
    expect(zeroes).toHaveLength(23);
  });

  it('returns buckets ordered from oldest to newest', () => {
    const result = runRepo.sparkline('runs');
    for (let i = 1; i < result.length; i++) {
      expect((result[i]?.hour ?? '') >= (result[i - 1]?.hour ?? '')).toBe(true);
    }
  });
});
