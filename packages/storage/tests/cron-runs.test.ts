import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { CronRunRepo } from '../src/repos/cron-runs';
import { CronRepo } from '../src/repos/crons';

let db: DB;
let cronRepo: CronRepo;
let runRepo: CronRunRepo;
let cronId: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  cronRepo = new CronRepo(db);
  runRepo = new CronRunRepo(db);
  const cron = cronRepo.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
  cronId = cron.id;
});

describe('CronRunRepo', () => {
  it('start creates a running run', () => {
    const run = runRepo.start(cronId);
    expect(run.status).toBe('running');
    expect(run.cronId).toBe(cronId);
    expect(run.finishedAt).toBeNull();
  });

  it('finish sets status, output, finished_at', () => {
    const run = runRepo.start(cronId);
    runRepo.finish(run.id, 'success', 'all good');
    const fetched = runRepo.get(run.id);
    expect(fetched?.status).toBe('success');
    expect(fetched?.output).toBe('all good');
    expect(fetched?.finishedAt).not.toBeNull();
  });

  it('finish with failed status records error', () => {
    const run = runRepo.start(cronId);
    runRepo.finish(run.id, 'failed', null, 'rate limit');
    const fetched = runRepo.get(run.id);
    expect(fetched?.status).toBe('failed');
    expect(fetched?.error).toBe('rate limit');
  });

  it('recent returns runs in descending start order', () => {
    runRepo.start(cronId);
    runRepo.start(cronId);
    runRepo.start(cronId);
    const recent = runRepo.recent(cronId, 10);
    expect(recent).toHaveLength(3);
  });

  it('cascade deletes runs when cron is deleted', () => {
    runRepo.start(cronId);
    cronRepo.delete(cronId);
    expect(runRepo.recent(cronId).length).toBe(0);
  });
});
