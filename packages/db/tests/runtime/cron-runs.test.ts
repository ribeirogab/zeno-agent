import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';
import { CronRunRepo } from '../../src/runtime/repos/cron-runs.js';
import { CronRepo } from '../../src/runtime/repos/crons.js';

let close: () => void;
let cronRepo: CronRepo;
let runRepo: CronRunRepo;
let cronId: string;

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  close = opened.close;
  cronRepo = new CronRepo(opened.drizzle);
  runRepo = new CronRunRepo(opened.drizzle);
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

describe('CronRunRepo', () => {
  it('start creates a running run', () => {
    const run = runRepo.start(cronId);
    expect(run.status).toBe('running');
    expect(run.cronId).toBe(cronId);
    expect(run.finishedAt).toBeNull();
  });

  it('finish sets status, output, finished_at', () => {
    const run = runRepo.start(cronId);
    runRepo.finish(run.id, 'success', { output: 'all good' });
    const fetched = runRepo.get(run.id);
    expect(fetched?.status).toBe('success');
    expect(fetched?.output).toBe('all good');
    expect(fetched?.finishedAt).not.toBeNull();
  });

  it('finish with failed status records error', () => {
    const run = runRepo.start(cronId);
    runRepo.finish(run.id, 'failed', { error: 'rate limit' });
    const fetched = runRepo.get(run.id);
    expect(fetched?.status).toBe('failed');
    expect(fetched?.error).toBe('rate limit');
  });

  it('finish records sessionId', () => {
    const run = runRepo.start(cronId);
    runRepo.finish(run.id, 'success', { sessionId: 'sess_abc' });
    const fetched = runRepo.get(run.id);
    expect(fetched?.sessionId).toBe('sess_abc');
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
