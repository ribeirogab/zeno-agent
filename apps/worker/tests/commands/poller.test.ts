import {
  CommandRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandsPoller } from '@/commands/poller';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let repo: CommandRepo;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  repo = new CommandRepo(db);
});

describe('CommandsPoller', () => {
  it('sweeps stuck rows on start', () => {
    const stuck = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    repo.claimPending(1); // → processing
    const dispatcher = vi.fn();
    const poller = new CommandsPoller({
      commandRepo: repo,
      dispatch: dispatcher,
      tickMs: 60_000, // effectively off
    });
    poller.start();
    poller.stop();
    const got = repo.get(stuck.id);
    expect(got?.status).toBe('failed');
  });

  it('tick() claims pending rows and dispatches each', async () => {
    repo.enqueue({ type: 'cron_pause', payload: { cronId: 'a' }, correlationId: 'c1' });
    repo.enqueue({ type: 'cron_pause', payload: { cronId: 'b' }, correlationId: 'c2' });
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const poller = new CommandsPoller({ commandRepo: repo, dispatch, tickMs: 60_000 });
    await poller.tick();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('on handler success: finishes command with success', async () => {
    const cmd = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    const dispatch = vi.fn().mockResolvedValue({ ok: true, data: { hello: 'world' } });
    const poller = new CommandsPoller({ commandRepo: repo, dispatch, tickMs: 60_000 });
    await poller.tick();
    const got = repo.get(cmd.id);
    expect(got?.status).toBe('success');
    expect(got?.result).toBe(JSON.stringify({ hello: 'world' }));
  });

  it('on handler failure: finishes command with failed + error', async () => {
    const cmd = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    const dispatch = vi.fn().mockResolvedValue({ ok: false, error: 'boom' });
    const poller = new CommandsPoller({ commandRepo: repo, dispatch, tickMs: 60_000 });
    await poller.tick();
    const got = repo.get(cmd.id);
    expect(got?.status).toBe('failed');
    expect(got?.result).toBe(JSON.stringify({ error: 'boom' }));
  });

  it('on handler throw: catches and finishes failed', async () => {
    const cmd = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    const dispatch = vi.fn().mockRejectedValue(new Error('unexpected'));
    const poller = new CommandsPoller({ commandRepo: repo, dispatch, tickMs: 60_000 });
    await poller.tick();
    const got = repo.get(cmd.id);
    expect(got?.status).toBe('failed');
    expect(got?.result).toContain('unexpected');
  });
});
