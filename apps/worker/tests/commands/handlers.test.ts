import {
  type Command,
  CronRepo,
  CronRunRepo,
  type DB,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHandlerMap } from '@/commands/handlers';

function makeCmd(partial: Partial<Command> & Pick<Command, 'type' | 'id'>): Command {
  return {
    payload: null,
    status: 'processing',
    createdAt: '2026-04-16T00:00:00Z',
    processedAt: '2026-04-16T00:00:00Z',
    completedAt: null,
    result: null,
    correlationId: 'corr',
    ...partial,
  };
}

let db: DB;
let crons: CronRepo;
let cronRuns: CronRunRepo;
let handlers: ReturnType<typeof buildHandlerMap>;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  crons = new CronRepo(db);
  cronRuns = new CronRunRepo(db);
  handlers = buildHandlerMap({
    crons,
    cronRuns,
    runner: { runOnce: vi.fn().mockResolvedValue(undefined) },
    exit: vi.fn(),
  });
});

describe('cron_pause handler', () => {
  it('sets enabled=false on the target cron', async () => {
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const result = await handlers.cron_pause(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_pause',
        payload: JSON.stringify({ cronId: cron.id }),
      }),
    );
    expect(result).toEqual({ ok: true, data: { cronId: cron.id } });
    expect(crons.get(cron.id)?.enabled).toBe(false);
  });

  it('fails if cron does not exist', async () => {
    const result = await handlers.cron_pause(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_pause',
        payload: JSON.stringify({ cronId: 'missing' }),
      }),
    );
    expect(result).toEqual({ ok: false, error: 'cron missing not found' });
  });

  it('fails if payload is invalid', async () => {
    const result = await handlers.cron_pause(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_pause',
        payload: null,
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('cron_resume handler', () => {
  it('sets enabled=true and recomputes next_run_at', async () => {
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
      enabled: false,
    });
    const result = await handlers.cron_resume(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_resume',
        payload: JSON.stringify({ cronId: cron.id }),
      }),
    );
    expect(result.ok).toBe(true);
    const updated = crons.get(cron.id);
    expect(updated?.enabled).toBe(true);
    expect(updated?.nextRunAt).not.toBeNull();
  });
});

describe('cron_run_now handler', () => {
  it('invokes runner.runOnce with the cron', async () => {
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const runOnce = vi.fn().mockResolvedValue(undefined);
    const localHandlers = buildHandlerMap({
      crons,
      cronRuns,
      runner: { runOnce },
      exit: vi.fn(),
    });
    const result = await localHandlers.cron_run_now(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_run_now',
        payload: JSON.stringify({ cronId: cron.id }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(runOnce).toHaveBeenCalledWith(expect.objectContaining({ id: cron.id }));
  });
});

describe('cron_delete handler', () => {
  it('refuses to delete static-source crons', async () => {
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'static',
    });
    const result = await handlers.cron_delete(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_delete',
        payload: JSON.stringify({ cronId: cron.id }),
      }),
    );
    expect(result).toEqual({ ok: false, error: 'cannot delete static cron' });
    expect(crons.get(cron.id)).not.toBeNull();
  });

  it('deletes chat-source crons', async () => {
    const cron = crons.create({
      name: 'x',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const result = await handlers.cron_delete(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_delete',
        payload: JSON.stringify({ cronId: cron.id }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(crons.get(cron.id)).toBeNull();
  });
});

describe('cron_create handler', () => {
  it('validates and inserts a new cron with source=chat', async () => {
    const result = await handlers.cron_create(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_create',
        payload: JSON.stringify({
          name: 'new-cron',
          prompt: 'hello',
          schedule: '* * * * *',
        }),
      }),
    );
    expect(result.ok).toBe(true);
    const list = crons.list({ source: 'chat' });
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('new-cron');
  });

  it('rejects invalid schedule', async () => {
    const result = await handlers.cron_create(
      makeCmd({
        id: 'cmd-1',
        type: 'cron_create',
        payload: JSON.stringify({
          name: 'x',
          prompt: 'p',
          schedule: 'not-a-cron',
        }),
      }),
    );
    expect(result.ok).toBe(false);
  });
});

// Spec 0067 C: worker_restart handler removed. The HandlerMap no longer
// includes 'worker_restart'; the api route that enqueued the command is
// gone too. Existing rows of type='worker_restart' in the commands table
// are silently no-ops at the dispatcher (unknown handler).
