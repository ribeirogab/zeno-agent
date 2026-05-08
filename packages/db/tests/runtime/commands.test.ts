import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';
import { CommandRepo } from '../../src/runtime/repos/commands.js';

let close: () => void;
let repo: CommandRepo;

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  close = opened.close;
  repo = new CommandRepo(opened.drizzle);
});

afterEach(() => {
  close();
});

describe('CommandRepo.enqueue', () => {
  it('inserts a row with status=pending and a generated id', () => {
    const cmd = repo.enqueue({
      type: 'cron_pause',
      payload: { cronId: 'abc' },
      correlationId: 'corr-1',
    });
    expect(cmd.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cmd.type).toBe('cron_pause');
    expect(cmd.status).toBe('pending');
    expect(cmd.payload).toBe(JSON.stringify({ cronId: 'abc' }));
    expect(cmd.correlationId).toBe('corr-1');
  });

  it('stores null payload when none provided', () => {
    // 'worker_restart' is no longer in the CommandType union (spec 0067 C)
    // but the test exercises null-payload behavior; cast keeps the
    // historical fixture intact.
    const cmd = repo.enqueue({
      type: 'worker_restart' as never,
      correlationId: 'corr-2',
    });
    expect(cmd.payload).toBeNull();
  });
});

describe('CommandRepo.claimPending', () => {
  it('atomically marks up to N pending rows as processing and returns them', () => {
    repo.enqueue({ type: 'cron_pause', payload: { id: '1' }, correlationId: 'c1' });
    repo.enqueue({ type: 'cron_pause', payload: { id: '2' }, correlationId: 'c2' });
    repo.enqueue({ type: 'cron_pause', payload: { id: '3' }, correlationId: 'c3' });

    const claimed = repo.claimPending(2);

    expect(claimed).toHaveLength(2);
    expect(claimed[0]?.status).toBe('processing');
    expect(claimed[0]?.processedAt).not.toBeNull();
    expect(claimed.map((c) => c.correlationId)).toEqual(['c1', 'c2']);

    // the third one remains pending
    const remaining = repo.claimPending(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.correlationId).toBe('c3');
  });

  it('returns empty array when no pending rows', () => {
    expect(repo.claimPending(5)).toEqual([]);
  });
});

describe('CommandRepo.finish', () => {
  it('sets status=success + completed_at + result', () => {
    const cmd = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    repo.claimPending(1);
    repo.finish(cmd.id, 'success', { data: 'ok' });
    const got = repo.get(cmd.id);
    expect(got?.status).toBe('success');
    expect(got?.completedAt).not.toBeNull();
    expect(got?.result).toBe(JSON.stringify({ data: 'ok' }));
  });

  it('sets status=failed + error result', () => {
    const cmd = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    repo.claimPending(1);
    repo.finish(cmd.id, 'failed', { error: 'boom' });
    const got = repo.get(cmd.id);
    expect(got?.status).toBe('failed');
    expect(got?.result).toBe(JSON.stringify({ error: 'boom' }));
  });
});

describe('CommandRepo.sweepStuck', () => {
  it('marks all processing rows as failed with worker_restarted error', () => {
    const cmd1 = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    repo.enqueue({ type: 'cron_pause', correlationId: 'c2' });
    repo.claimPending(1); // only c1 → processing
    const swept = repo.sweepStuck();
    expect(swept).toBe(1);
    const got = repo.get(cmd1.id);
    expect(got?.status).toBe('failed');
    expect(got?.result).toBe(JSON.stringify({ error: 'worker_restarted' }));
  });

  it('returns 0 when nothing is processing', () => {
    expect(repo.sweepStuck()).toBe(0);
  });
});

describe('CommandRepo.findByCorrelationId', () => {
  it('returns the row with the given correlationId', () => {
    const enqueued = repo.enqueue({
      type: 'cron_pause',
      payload: { id: '1' },
      correlationId: 'corr-find-1',
    });
    const found = repo.findByCorrelationId('corr-find-1');
    expect(found?.id).toBe(enqueued.id);
    expect(found?.correlationId).toBe('corr-find-1');
    expect(found?.type).toBe('cron_pause');
  });

  it('returns null when no row matches the correlationId', () => {
    repo.enqueue({ type: 'cron_pause', correlationId: 'corr-other' });
    expect(repo.findByCorrelationId('corr-missing')).toBeNull();
  });
});

describe('CommandRepo.recent', () => {
  it('returns rows ordered by created_at desc', () => {
    const first = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    const second = repo.enqueue({ type: 'cron_pause', correlationId: 'c2' });
    const rows = repo.recent(10);
    expect(rows[0]?.id).toBe(second.id);
    expect(rows[1]?.id).toBe(first.id);
  });
});
