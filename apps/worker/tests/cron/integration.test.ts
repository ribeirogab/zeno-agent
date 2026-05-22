// Spec 2026-05-22 (crons CLI-first) — full integration test.
//
// Exercises the fire path end-to-end: CronManager + a real CRON.md on disk +
// MockBackend + real CronRepo/CronRunRepo against an in-memory SQLite.
// The cron fires on a schedule of `* * * * *` (every minute); we don't wait
// for the wall-clock tick — we manually invoke fireAndReschedule via the
// scheduling timer hook. This validates: parse, scheduling, fire, AgentBackend
// query call, cron_runs row insertion, session_id capture, last_run_at
// update, and post-fire reschedule.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CronRepo, CronRunRepo, openRuntimeDatabase, runRuntimeMigrations } from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockBackend } from '@/agent/backends/mock';
import { CronManager } from '@/cron/manager';

let dir: string;
let close: () => void;
let crons: CronRepo;
let cronRuns: CronRunRepo;
let manager: CronManager;
const logger = createLogger({ service: 'test-integ' });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cron-integ-'));
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  close = opened.close;
  crons = new CronRepo(opened.drizzle);
  cronRuns = new CronRunRepo(opened.drizzle);

  const backend = new MockBackend([{ match: /^Say hello/, reply: 'hello back!' }]);

  manager = new CronManager({
    rootDir: dir,
    crons,
    cronRuns,
    pollIntervalMs: 999_999,
    logger,
    fire: async (slug, body, cwd) => {
      const out = await backend.query({
        systemPrompt: '',
        userMessage: body,
        cwd,
        correlationId: `cron-${slug}-${Date.now()}`,
        persistSession: false,
      });
      return { sessionId: out.sessionId ?? null, status: 'success' as const };
    },
  });
});

afterEach(async () => {
  await manager.stop();
  close();
  rmSync(dir, { recursive: true, force: true });
});

function writeCron(slug: string, schedule: string, body: string): void {
  const cdir = join(dir, slug);
  mkdirSync(cdir, { recursive: true });
  const content = [
    '---',
    `name: ${slug}`,
    `schedule: '${schedule}'`,
    'enabled: true',
    '---',
    body,
    '',
  ].join('\n');
  writeFileSync(join(cdir, 'CRON.md'), content);
}

describe('crons-cli-first integration', () => {
  it('boots, reconciles, fires, and records session id (full lifecycle)', async () => {
    writeCron('hello-world', '* * * * *', 'Say hello to the world!');
    writeCron('disabled-cron', '0 0 * * *', 'I should not fire'); // far-future schedule

    // Boot: reconcile + schedule timeouts.
    await manager.reconcileOnce();

    // Two rows materialized from filesystem.
    const rows = crons.list();
    expect(rows).toHaveLength(2);
    const hello = crons.get('hello-world');
    expect(hello?.name).toBe('hello-world');
    expect(hello?.enabled).toBe(true);
    expect(hello?.contentHash).not.toBe('');
    expect(hello?.lastError).toBeNull();

    // Manually invoke the fire path (we don't want to wait for the wall clock).
    // The CronManager normally calls fireAndReschedule via setTimeout; we exercise
    // the same code by calling the fire callback directly through the manager's
    // private path. Since fireAndReschedule is private, we trigger it via
    // changing the schedule to a 1ms delay and waiting one tick. The simpler
    // approach: invoke fire callback directly.
    const fireResult = await (
      manager as unknown as {
        fireAndReschedule(slug: string): Promise<void>;
      }
    ).fireAndReschedule('hello-world');
    expect(fireResult).toBeUndefined();

    // cron_runs has one row with the mock session id.
    const runs = cronRuns.recent('hello-world', 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.sessionId).toMatch(/^mock-sess-/);
    expect(runs[0]?.status).toBe('success');

    // crons row had lastRunAt + nextRunAt updated.
    const after = crons.get('hello-world');
    expect(after?.lastRunAt).not.toBeNull();
    expect(after?.nextRunAt).not.toBeNull();
  });

  it('handles invalid CRON.md gracefully (lastError surfaces, no fire)', async () => {
    writeCron('bad-schedule', 'not-a-cron-expr', 'Whatever');
    await manager.reconcileOnce();

    const row = crons.get('bad-schedule');
    expect(row).not.toBeNull();
    expect(row?.lastError).toContain('invalid_schedule');
    expect(row?.enabled).toBe(false);

    // No fire — no cron_runs row should exist.
    expect(cronRuns.recent('bad-schedule', 10)).toHaveLength(0);
  });

  it('deletes folder → row + history cascade clears within next reconcile', async () => {
    writeCron('ephemeral', '* * * * *', 'temp prompt');
    await manager.reconcileOnce();
    expect(crons.get('ephemeral')).not.toBeNull();

    // Simulate `zeno cron delete`: remove folder.
    rmSync(join(dir, 'ephemeral'), { recursive: true });
    await manager.reconcileOnce();

    expect(crons.get('ephemeral')).toBeNull();
    expect(cronRuns.recent('ephemeral', 10)).toHaveLength(0);
  });
});
