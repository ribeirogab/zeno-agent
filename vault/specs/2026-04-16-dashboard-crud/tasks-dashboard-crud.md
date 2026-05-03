---
feature: dashboard-crud
plan: "[[plan-dashboard-crud]]"
spec: "[[spec-dashboard-crud]]"
created: 2026-04-16
---
# Dashboard CRUD — Tasks

**For this plan:** `[[plan-dashboard-crud]]`

> **Conventions for every task:**
> - Absolute paths from project root.
> - "Run … Expected: …" — the agent must run it and verify the expected output exactly. If actual differs, stop and surface.
> - **Never use `any`. Never write `// biome-ignore`.** If a strict-typed solution is unclear, stop and ask.
> - Each task ends with `git add <files>` + `git commit -m "..."`. Conventional commits in English, no AI attribution.
> - Temp files (screenshots, scratch) go under `tmp/` per `context/rules/generated-files-location.md`.

---

## Phase 1 — Storage foundation

### Task 1.1: Add `Command` types + migration 2

**Files:**
- Modify: `packages/storage/src/types.ts`
- Modify: `packages/storage/src/migrations.ts`

- [ ] **Step 1: Add types to `packages/storage/src/types.ts`**

Append at the bottom of the file:

```typescript
export type CommandType =
  | 'cron_create'
  | 'cron_pause'
  | 'cron_resume'
  | 'cron_run_now'
  | 'cron_delete'
  | 'worker_restart';

export type CommandStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface Command {
  id: string;
  type: CommandType;
  payload: string | null;
  status: CommandStatus;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  result: string | null;
  correlationId: string;
}

export interface CreateCommandInput {
  type: CommandType;
  payload?: unknown;
  correlationId: string;
}
```

- [ ] **Step 2: Add migration 2 to `packages/storage/src/migrations.ts`**

Find the `migrations` array and append a new entry:

```typescript
{
  id: 2,
  name: 'commands',
  up: `
    CREATE TABLE commands (
      id             TEXT PRIMARY KEY,
      type           TEXT NOT NULL,
      payload        TEXT,
      status         TEXT NOT NULL DEFAULT 'pending',
      created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at   TEXT,
      completed_at   TEXT,
      result         TEXT,
      correlation_id TEXT NOT NULL
    );
    CREATE INDEX commands_pending_idx ON commands(status, created_at) WHERE status = 'pending';
  `,
},
```

- [ ] **Step 3: Typecheck and commit**

Run: `cd packages/storage && pnpm typecheck`
Expected: no errors.

```bash
git add packages/storage/src/types.ts packages/storage/src/migrations.ts
git commit -m "feat(storage): add Command types + migration 2 (commands table)"
```

---

### Task 1.2: `CommandRepo` (TDD)

**Files:**
- Create: `packages/storage/src/repos/commands.ts`
- Create: `packages/storage/tests/commands.test.ts`
- Modify: `packages/storage/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/storage/tests/commands.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { CommandRepo } from '../src/repos/commands.js';

let db: DB;
let repo: CommandRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new CommandRepo(db);
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
    const cmd = repo.enqueue({ type: 'worker_restart', correlationId: 'corr-2' });
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

describe('CommandRepo.recent', () => {
  it('returns rows ordered by created_at desc', () => {
    const first = repo.enqueue({ type: 'cron_pause', correlationId: 'c1' });
    const second = repo.enqueue({ type: 'cron_pause', correlationId: 'c2' });
    const rows = repo.recent(10);
    expect(rows[0]?.id).toBe(second.id);
    expect(rows[1]?.id).toBe(first.id);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd packages/storage && pnpm test`
Expected: fails with module not found for `../src/repos/commands.js`.

- [ ] **Step 3: Implement `CommandRepo`**

`packages/storage/src/repos/commands.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type {
  Command,
  CommandStatus,
  CommandType,
  CreateCommandInput,
} from '../types.js';

interface CommandRow {
  id: string;
  type: string;
  payload: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  completed_at: string | null;
  result: string | null;
  correlation_id: string;
}

function rowToCommand(row: CommandRow): Command {
  return {
    id: row.id,
    type: row.type as CommandType,
    payload: row.payload,
    status: row.status as CommandStatus,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    completedAt: row.completed_at,
    result: row.result,
    correlationId: row.correlation_id,
  };
}

export class CommandRepo {
  constructor(private readonly db: DB) {}

  enqueue(input: CreateCommandInput): Command {
    const id = randomUUID();
    const payloadJson = input.payload === undefined ? null : JSON.stringify(input.payload);
    this.db
      .prepare(
        `INSERT INTO commands (id, type, payload, correlation_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, input.type, payloadJson, input.correlationId);
    const row = this.db
      .prepare('SELECT * FROM commands WHERE id = ?')
      .get(id) as CommandRow | undefined;
    if (!row) throw new Error(`failed to read back command ${id}`);
    return rowToCommand(row);
  }

  claimPending(limit: number): Command[] {
    const rows = this.db
      .prepare(
        `UPDATE commands
         SET status = 'processing', processed_at = CURRENT_TIMESTAMP
         WHERE id IN (
           SELECT id FROM commands
           WHERE status = 'pending'
           ORDER BY created_at
           LIMIT ?
         )
         RETURNING *`,
      )
      .all(limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  finish(id: string, status: Exclude<CommandStatus, 'pending' | 'processing'>, result?: unknown): void {
    const resultJson = result === undefined ? null : JSON.stringify(result);
    this.db
      .prepare(
        `UPDATE commands
         SET status = ?, completed_at = CURRENT_TIMESTAMP, result = ?
         WHERE id = ?`,
      )
      .run(status, resultJson, id);
  }

  get(id: string): Command | null {
    const row = this.db
      .prepare('SELECT * FROM commands WHERE id = ?')
      .get(id) as CommandRow | undefined;
    return row ? rowToCommand(row) : null;
  }

  recent(limit: number): Command[] {
    const rows = this.db
      .prepare('SELECT * FROM commands ORDER BY created_at DESC LIMIT ?')
      .all(limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  sweepStuck(): number {
    const result = this.db
      .prepare(
        `UPDATE commands
         SET status = 'failed', completed_at = CURRENT_TIMESTAMP, result = ?
         WHERE status = 'processing'`,
      )
      .run(JSON.stringify({ error: 'worker_restarted' }));
    return Number(result.changes);
  }
}
```

- [ ] **Step 4: Re-export from `packages/storage/src/index.ts`**

Add to the exports:

```typescript
export { CommandRepo } from './repos/commands.js';
```

And ensure the types re-export covers Command types:

```typescript
export type {
  Session,
  CronSource,
  CronRunStatus,
  Cron,
  CreateCronInput,
  UpdateCronInput,
  CronRun,
  Command,
  CommandType,
  CommandStatus,
  CreateCommandInput,
} from './types.js';
```

- [ ] **Step 5: Run tests**

Run: `cd packages/storage && pnpm test`
Expected: all 4 prior test files pass, plus `commands.test.ts` with 8 passing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/storage/src/repos/commands.ts packages/storage/src/index.ts packages/storage/tests/commands.test.ts
git commit -m "feat(storage): CommandRepo with enqueue/claim/finish/sweepStuck (TDD)"
```

---

## Phase 2 — Worker commands poller

### Task 2.1: Poller skeleton + `sweepStuck` on boot + tick loop

**Files:**
- Create: `apps/worker/src/commands/poller.ts`
- Create: `apps/worker/src/commands/dispatcher.ts`
- Create: `apps/worker/tests/commands/poller.test.ts`

- [ ] **Step 1: Write `dispatcher.ts` (interface first, handlers come in Task 2.2)**

```typescript
import type { Command } from '@zeno/storage';

export type HandlerResult = { ok: true; data?: unknown } | { ok: false; error: string };

export type Handler = (cmd: Command) => Promise<HandlerResult>;

export type HandlerMap = Record<Command['type'], Handler>;

export function buildDispatcher(handlers: HandlerMap): (cmd: Command) => Promise<HandlerResult> {
  return async (cmd) => {
    const h = handlers[cmd.type];
    if (!h) return { ok: false, error: `unknown command type: ${cmd.type}` };
    return h(cmd);
  };
}
```

- [ ] **Step 2: Write the failing poller test**

`apps/worker/tests/commands/poller.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DB,
  CommandRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { CommandsPoller } from '@/commands/poller';

let db: DB;
let repo: CommandRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
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
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd apps/worker && pnpm test tests/commands`
Expected: module not found for `@/commands/poller`.

- [ ] **Step 4: Implement `CommandsPoller`**

`apps/worker/src/commands/poller.ts`:

```typescript
import type { Command, CommandRepo } from '@zeno/storage';
import { createLogger } from '@zeno/logger';
import type { HandlerResult } from '@/commands/dispatcher';

const logger = createLogger({ service: 'worker' });

interface CommandsPollerOptions {
  commandRepo: CommandRepo;
  dispatch: (cmd: Command) => Promise<HandlerResult>;
  tickMs?: number;
}

export class CommandsPoller {
  private timer: NodeJS.Timeout | null = null;
  /**
   * Reentrancy guard. Rows are only ever claimed once from the DB, so this
   * protects the in-memory handler chain when tick() re-enters while a slow
   * handler is still awaiting. Keyed by cmd.id.
   */
  private readonly inFlight = new Set<string>();
  private readonly tickMs: number;

  constructor(private readonly opts: CommandsPollerOptions) {
    this.tickMs = opts.tickMs ?? 1000;
  }

  start(): void {
    if (this.timer) return;
    const swept = this.opts.commandRepo.sweepStuck();
    if (swept > 0) {
      logger.warn({ event: 'commands_swept', count: swept }, 'marked stuck commands as failed');
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    logger.info({ event: 'commands_poller_started', tickMs: this.tickMs }, 'commands poller started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info({ event: 'commands_poller_stopped' }, 'commands poller stopped');
    }
  }

  /** Exposed for tests. Runs one claim → dispatch loop sequentially. */
  async tick(): Promise<void> {
    const claimed = this.opts.commandRepo.claimPending(10);
    for (const cmd of claimed) {
      if (this.inFlight.has(cmd.id)) continue;
      this.inFlight.add(cmd.id);
      try {
        const result = await this.opts.dispatch(cmd);
        if (result.ok) {
          this.opts.commandRepo.finish(cmd.id, 'success', result.data ?? {});
        } else {
          this.opts.commandRepo.finish(cmd.id, 'failed', { error: result.error });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.commandRepo.finish(cmd.id, 'failed', { error: message });
        logger.error(
          { event: 'command_handler_threw', commandId: cmd.id, type: cmd.type, err: message },
          'command handler threw',
        );
      } finally {
        this.inFlight.delete(cmd.id);
      }
    }
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/worker && pnpm test tests/commands`
Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/commands/poller.ts apps/worker/src/commands/dispatcher.ts apps/worker/tests/commands/poller.test.ts
git commit -m "feat(worker): CommandsPoller with sweepStuck + tick dispatch (TDD)"
```

---

### Task 2.2: Handler implementations (one at a time, TDD)

**Files:**
- Create: `apps/worker/src/commands/handlers/pause.ts`
- Create: `apps/worker/src/commands/handlers/resume.ts`
- Create: `apps/worker/src/commands/handlers/run-now.ts`
- Create: `apps/worker/src/commands/handlers/delete.ts`
- Create: `apps/worker/src/commands/handlers/create.ts`
- Create: `apps/worker/src/commands/handlers/restart.ts`
- Create: `apps/worker/src/commands/handlers/index.ts` (re-exports + `buildHandlerMap`)
- Create: `apps/worker/tests/commands/handlers.test.ts`

- [ ] **Step 1: Write failing tests for all six handlers**

`apps/worker/tests/commands/handlers.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DB,
  type Command,
  CronRepo,
  CronRunRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
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
      name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat',
    });
    const result = await handlers.cron_pause(makeCmd({
      id: 'cmd-1', type: 'cron_pause', payload: JSON.stringify({ cronId: cron.id }),
    }));
    expect(result).toEqual({ ok: true, data: { cronId: cron.id } });
    expect(crons.get(cron.id)?.enabled).toBe(false);
  });

  it('fails if cron does not exist', async () => {
    const result = await handlers.cron_pause(makeCmd({
      id: 'cmd-1', type: 'cron_pause', payload: JSON.stringify({ cronId: 'missing' }),
    }));
    expect(result).toEqual({ ok: false, error: 'cron missing not found' });
  });

  it('fails if payload is invalid', async () => {
    const result = await handlers.cron_pause(makeCmd({
      id: 'cmd-1', type: 'cron_pause', payload: null,
    }));
    expect(result.ok).toBe(false);
  });
});

describe('cron_resume handler', () => {
  it('sets enabled=true and recomputes next_run_at', async () => {
    const cron = crons.create({
      name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat', enabled: false,
    });
    const result = await handlers.cron_resume(makeCmd({
      id: 'cmd-1', type: 'cron_resume', payload: JSON.stringify({ cronId: cron.id }),
    }));
    expect(result.ok).toBe(true);
    const updated = crons.get(cron.id);
    expect(updated?.enabled).toBe(true);
    expect(updated?.nextRunAt).not.toBeNull();
  });
});

describe('cron_run_now handler', () => {
  it('invokes runner.runOnce with the cron', async () => {
    const cron = crons.create({
      name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat',
    });
    const runOnce = vi.fn().mockResolvedValue(undefined);
    const localHandlers = buildHandlerMap({
      crons, cronRuns,
      runner: { runOnce },
      exit: vi.fn(),
    });
    const result = await localHandlers.cron_run_now(makeCmd({
      id: 'cmd-1', type: 'cron_run_now', payload: JSON.stringify({ cronId: cron.id }),
    }));
    expect(result.ok).toBe(true);
    expect(runOnce).toHaveBeenCalledWith(expect.objectContaining({ id: cron.id }));
  });
});

describe('cron_delete handler', () => {
  it('refuses to delete static-source crons', async () => {
    const cron = crons.create({
      name: 'x', prompt: 'p', schedule: '* * * * *', source: 'static',
    });
    const result = await handlers.cron_delete(makeCmd({
      id: 'cmd-1', type: 'cron_delete', payload: JSON.stringify({ cronId: cron.id }),
    }));
    expect(result).toEqual({ ok: false, error: 'cannot delete static cron' });
    expect(crons.get(cron.id)).not.toBeNull();
  });

  it('deletes chat-source crons', async () => {
    const cron = crons.create({
      name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat',
    });
    const result = await handlers.cron_delete(makeCmd({
      id: 'cmd-1', type: 'cron_delete', payload: JSON.stringify({ cronId: cron.id }),
    }));
    expect(result.ok).toBe(true);
    expect(crons.get(cron.id)).toBeNull();
  });
});

describe('cron_create handler', () => {
  it('validates and inserts a new cron with source=chat', async () => {
    const result = await handlers.cron_create(makeCmd({
      id: 'cmd-1', type: 'cron_create',
      payload: JSON.stringify({
        name: 'new-cron', prompt: 'hello', schedule: '* * * * *',
      }),
    }));
    expect(result.ok).toBe(true);
    const list = crons.list({ source: 'chat' });
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('new-cron');
  });

  it('rejects invalid schedule', async () => {
    const result = await handlers.cron_create(makeCmd({
      id: 'cmd-1', type: 'cron_create',
      payload: JSON.stringify({
        name: 'x', prompt: 'p', schedule: 'not-a-cron',
      }),
    }));
    expect(result.ok).toBe(false);
  });
});

describe('worker_restart handler', () => {
  it('calls exit(0) and returns ok', async () => {
    const exit = vi.fn();
    const localHandlers = buildHandlerMap({
      crons, cronRuns, runner: { runOnce: vi.fn() }, exit,
    });
    const result = await localHandlers.worker_restart(makeCmd({
      id: 'cmd-1', type: 'worker_restart',
    }));
    expect(result.ok).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

Run: `cd apps/worker && pnpm test tests/commands/handlers.test.ts`

- [ ] **Step 3: Implement each handler file**

`apps/worker/src/commands/handlers/pause.ts`:

```typescript
import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({ cronId: z.string().min(1) });

export function buildPauseHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    crons.update(cron.id, { enabled: false });
    return { ok: true, data: { cronId: cron.id } };
  };
}
```

`apps/worker/src/commands/handlers/resume.ts`:

```typescript
import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import { nextRunAfter } from '@/cron/parser';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({ cronId: z.string().min(1) });

export function buildResumeHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    const next = nextRunAfter(cron.schedule, new Date());
    crons.update(cron.id, { enabled: true, nextRunAt: next ? next.toISOString() : null });
    return { ok: true, data: { cronId: cron.id, nextRunAt: next?.toISOString() ?? null } };
  };
}
```

`apps/worker/src/commands/handlers/run-now.ts`:

```typescript
import type { Cron, CronRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({ cronId: z.string().min(1) });

export interface RunnerLike {
  runOnce(cron: Cron): Promise<void>;
}

export function buildRunNowHandler(crons: CronRepo, runner: RunnerLike): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    await runner.runOnce(cron);
    return { ok: true, data: { cronId: cron.id } };
  };
}
```

`apps/worker/src/commands/handlers/delete.ts`:

```typescript
import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({ cronId: z.string().min(1) });

export function buildDeleteHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    if (cron.source === 'static') return { ok: false, error: 'cannot delete static cron' };
    crons.delete(cron.id);
    return { ok: true, data: { cronId: cron.id } };
  };
}
```

`apps/worker/src/commands/handlers/create.ts`:

```typescript
import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import { nextRunAfter, validateSchedule } from '@/cron/parser';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().optional(),
  prompt: z.string().min(1),
  schedule: z.string().min(1),
  notifyConversationId: z.string().nullish(),
  notifyThreadId: z.string().nullish(),
});

export function buildCreateHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    try {
      validateSchedule(parsed.data.schedule);
    } catch (err) {
      return { ok: false, error: `invalid schedule: ${String(err)}` };
    }
    const next = nextRunAfter(parsed.data.schedule, new Date());
    const cron = crons.create({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      prompt: parsed.data.prompt,
      schedule: parsed.data.schedule,
      enabled: true,
      source: 'chat',
      createdBy: 'dashboard',
      notifyConversationId: parsed.data.notifyConversationId ?? null,
      notifyThreadId: parsed.data.notifyThreadId ?? null,
      nextRunAt: next ? next.toISOString() : null,
    });
    return { ok: true, data: { cronId: cron.id } };
  };
}
```

`apps/worker/src/commands/handlers/restart.ts`:

```typescript
import type { Handler } from '@/commands/dispatcher';

export function buildRestartHandler(exit: (code: number) => void): Handler {
  return async () => {
    // Give the finish() write a tick to flush before exit
    setTimeout(() => exit(0), 50);
    return { ok: true, data: { restartingIn: '50ms' } };
  };
}
```

`apps/worker/src/commands/handlers/index.ts`:

```typescript
import type { CronRepo, CronRunRepo } from '@zeno/storage';
import type { HandlerMap } from '@/commands/dispatcher';
import { buildCreateHandler } from '@/commands/handlers/create';
import { buildDeleteHandler } from '@/commands/handlers/delete';
import { buildPauseHandler } from '@/commands/handlers/pause';
import { buildRestartHandler } from '@/commands/handlers/restart';
import { buildResumeHandler } from '@/commands/handlers/resume';
import { type RunnerLike, buildRunNowHandler } from '@/commands/handlers/run-now';

export interface HandlerDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  runner: RunnerLike;
  exit: (code: number) => void;
}

export function buildHandlerMap(deps: HandlerDeps): HandlerMap {
  return {
    cron_create: buildCreateHandler(deps.crons),
    cron_pause: buildPauseHandler(deps.crons),
    cron_resume: buildResumeHandler(deps.crons),
    cron_run_now: buildRunNowHandler(deps.crons, deps.runner),
    cron_delete: buildDeleteHandler(deps.crons),
    worker_restart: buildRestartHandler(deps.exit),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/worker && pnpm test tests/commands/handlers.test.ts`
Expected: all handler tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/commands/handlers apps/worker/tests/commands/handlers.test.ts
git commit -m "feat(worker): command handlers (pause/resume/run-now/delete/create/restart) with TDD"
```

---

### Task 2.3: Wire poller into `apps/worker/src/index.ts`

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add imports**

At the top of `apps/worker/src/index.ts`, add:

```typescript
import { CommandRepo } from '@zeno/storage';
import { buildDispatcher } from '@/commands/dispatcher';
import { buildHandlerMap } from '@/commands/handlers';
import { CommandsPoller } from '@/commands/poller';
```

- [ ] **Step 2: Instantiate CommandRepo + poller in the boot flow**

Find the section where `CronRunRepo` is instantiated. After it, add:

```typescript
const commands = new CommandRepo(db);

const dispatcher = buildDispatcher(
  buildHandlerMap({
    crons,
    cronRuns,
    runner,
    exit: (code) => process.exit(code),
  }),
);

const commandsPoller = new CommandsPoller({
  commandRepo: commands,
  dispatch: dispatcher,
});
```

- [ ] **Step 3: Start and stop the poller**

In the section after `await slack.start(...)` where the Slack handler is attached, after `runner.start()`, add:

```typescript
commandsPoller.start();
```

In the shutdown handler (`shutdown` function that calls `slack.stop()` / `runner.stop()`), add before `await slack.stop()`:

```typescript
commandsPoller.stop();
```

- [ ] **Step 4: Typecheck and smoke boot**

```bash
cd apps/worker && pnpm typecheck
```

Expected: no errors.

Run the Docker smoke:
```bash
pnpm run docker:build 2>&1 | tail -3
pnpm run docker:up
sleep 6
pnpm run docker:logs 2>&1 | grep commands_poller_started
pnpm run docker:down
```

Expected: log line `commands_poller_started tickMs=1000` appears.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat(worker): wire CommandsPoller into boot + shutdown sequence"
```

---

## Phase 3 — API crons routes

### Task 3.1: GET /api/crons (list) + /api/crons/:id (detail)

**Files:**
- Create: `apps/api/src/routes/crons.ts`
- Create: `apps/api/tests/routes/crons.test.ts`
- Modify: `apps/api/src/server.ts` (mount)

- [ ] **Step 1: Write the failing tests for list + detail**

`apps/api/tests/routes/crons.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DB,
  CronRepo,
  CronRunRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db: database,
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/crons', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/crons');
    expect(res.status).toBe(401);
  });

  it('returns empty list on empty db', async () => {
    const res = await makeApp(db).request('/api/crons', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns all crons ordered by created_at desc', async () => {
    const crons = new CronRepo(db);
    crons.create({ name: 'first', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    crons.create({ name: 'second', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request('/api/crons', { headers: authed() });
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.name).toBe('second');
  });

  it('filters by enabled=true', async () => {
    const crons = new CronRepo(db);
    crons.create({ name: 'on', prompt: 'p', schedule: '* * * * *', source: 'chat', enabled: true });
    crons.create({ name: 'off', prompt: 'p', schedule: '* * * * *', source: 'chat', enabled: false });
    const res = await makeApp(db).request('/api/crons?enabled=true', { headers: authed() });
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.name).toBe('on');
  });
});

describe('GET /api/crons/:id', () => {
  it('returns cron + recent runs', async () => {
    const crons = new CronRepo(db);
    const runs = new CronRunRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const run = runs.start(cron.id);
    runs.finish(run.id, 'success', 'ok');
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cron: { id: string }; recentRuns: Array<{ id: string }> };
    expect(body.cron.id).toBe(cron.id);
    expect(body.recentRuns).toHaveLength(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await makeApp(db).request('/api/crons/nope', { headers: authed() });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && pnpm test tests/routes/crons.test.ts`

- [ ] **Step 3: Implement `apps/api/src/routes/crons.ts` (list + detail only)**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { CronRepo, CronRunRepo, CronSource } from '@zeno/storage';

const listQuery = z.object({
  enabled: z.enum(['true', 'false']).optional(),
  source: z.enum(['static', 'chat']).optional(),
});

export interface CronsRouteDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
}

export function buildCronsRoute(deps: CronsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', zValidator('query', listQuery), (c) => {
    const { enabled, source } = c.req.valid('query');
    const filter: { enabled?: boolean; source?: CronSource } = {};
    if (enabled !== undefined) filter.enabled = enabled === 'true';
    if (source !== undefined) filter.source = source;
    return c.json(deps.crons.list(filter));
  });

  route.get('/:id', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'not_found' }, 404);
    const recentRuns = deps.cronRuns.recent(id, 20);
    return c.json({ cron, recentRuns });
  });

  return route;
}
```

- [ ] **Step 4: Mount in `apps/api/src/server.ts`**

Add import near the other route imports:

```typescript
import { buildCronsRoute } from '@/routes/crons';
```

In `createApp()` after the stats/activity mounts, add:

```typescript
app.use('/api/crons', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.use('/api/crons/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
```

Wait — Hono middleware paths: `app.use('/api/crons/*', ...)` covers `/api/crons/foo`. We also need to cover the exact `/api/crons` path. Simpler: apply middleware to the route's handlers directly by adding it inside `buildCronsRoute`. But we already have the pattern from Phase A (`app.use('/api/stats', requireAuth)`) — extend it:

```typescript
app.use('/api/crons', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.use('/api/crons/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.route('/api/crons', buildCronsRoute({ crons: deps.cronRepo, cronRuns: deps.cronRunRepo }));
```

This requires `CronRepo` + `CronRunRepo` on `AppDeps`. Update the type:

```typescript
export interface AppDeps {
  config: ApiConfig;
  db: DB;
  cronRepo: CronRepo;
  cronRunRepo: CronRunRepo;
  spaDir?: string;
}
```

Update `apps/api/src/index.ts` to construct these and pass them:

```typescript
// near the top of main():
const crons = new CronRepo(db);
const cronRuns = new CronRunRepo(db);
const app = createApp({ config, db, cronRepo: crons, cronRunRepo: cronRuns, spaDir });
```

- [ ] **Step 5: Update existing tests that call `createApp` to pass the new deps**

In `apps/api/tests/routes/auth.test.ts`, `stats.test.ts`, `activity.test.ts`, `health.test.ts`: wherever `createApp({config, db})` is called, add `cronRepo: new CronRepo(database)` and `cronRunRepo: new CronRunRepo(database)` to the call.

(Write a small `makeApp` helper in each test file if not already present.)

- [ ] **Step 6: Run all api tests**

Run: `cd apps/api && pnpm test`
Expected: all tests pass including 6 new crons tests. Total should be ~35.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/crons.ts apps/api/src/server.ts apps/api/src/index.ts apps/api/tests/
git commit -m "feat(api): GET /api/crons + /api/crons/:id (list + detail with recent runs)"
```

---

### Task 3.2: POST /api/crons (create) + mutation endpoints (pause/resume/run-now/delete)

**Files:**
- Modify: `apps/api/src/routes/crons.ts`
- Modify: `apps/api/tests/routes/crons.test.ts`
- Modify: `apps/api/src/server.ts` (inject CommandRepo)

- [ ] **Step 1: Extend tests with mutation assertions**

Append to `apps/api/tests/routes/crons.test.ts`:

```typescript
import { CommandRepo } from '@zeno/storage';

describe('POST /api/crons', () => {
  it('enqueues cron_create command', async () => {
    const commands = new CommandRepo(db);
    const res = await makeApp(db).request('/api/crons', {
      method: 'POST',
      headers: { ...authed(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'new-one',
        prompt: 'hi',
        schedule: '0 9 * * *',
      }),
    });
    expect(res.status).toBe(204);
    const pending = commands.claimPending(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe('cron_create');
  });

  it('rejects invalid body', async () => {
    const res = await makeApp(db).request('/api/crons', {
      method: 'POST',
      headers: { ...authed(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }), // missing prompt + schedule
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/crons/:id/pause', () => {
  it('enqueues cron_pause', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}/pause`, {
      method: 'POST',
      headers: authed(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('cron_pause');
  });

  it('returns 404 if cron does not exist', async () => {
    const res = await makeApp(db).request('/api/crons/missing/pause', {
      method: 'POST',
      headers: authed(),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/crons/:id', () => {
  it('refuses static crons with 409', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'static' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(409);
  });

  it('enqueues cron_delete for chat crons', async () => {
    const crons = new CronRepo(db);
    const cron = crons.create({ name: 'x', prompt: 'p', schedule: '* * * * *', source: 'chat' });
    const res = await makeApp(db).request(`/api/crons/${cron.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(204);
  });
});
```

Also add similar smoke tests for `resume` and `run-now` (same shape as pause).

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && pnpm test tests/routes/crons.test.ts`

- [ ] **Step 3: Extend `apps/api/src/routes/crons.ts` with mutations**

Replace the file's exports block. Add imports:

```typescript
import { randomUUID } from 'node:crypto';
import type { CommandRepo } from '@zeno/storage';
```

Extend `CronsRouteDeps`:

```typescript
export interface CronsRouteDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  commands: CommandRepo;
}
```

Add a shared input schema + mutation route handlers:

```typescript
const createBody = z.object({
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().optional(),
  prompt: z.string().min(1),
  schedule: z.string().min(1),
  notifyConversationId: z.string().nullish(),
  notifyThreadId: z.string().nullish(),
});

function enqueue(deps: CronsRouteDeps, type: 'cron_pause' | 'cron_resume' | 'cron_run_now' | 'cron_delete', cronId: string): void {
  deps.commands.enqueue({
    type,
    payload: { cronId },
    correlationId: randomUUID(),
  });
}
```

Inside `buildCronsRoute`, after the GET handlers:

```typescript
  route.post('/', zValidator('json', createBody), (c) => {
    const body = c.req.valid('json');
    deps.commands.enqueue({
      type: 'cron_create',
      payload: body,
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  route.post('/:id/pause', (c) => {
    const id = c.req.param('id');
    if (!deps.crons.get(id)) return c.json({ error: 'not_found' }, 404);
    enqueue(deps, 'cron_pause', id);
    return c.body(null, 204);
  });

  route.post('/:id/resume', (c) => {
    const id = c.req.param('id');
    if (!deps.crons.get(id)) return c.json({ error: 'not_found' }, 404);
    enqueue(deps, 'cron_resume', id);
    return c.body(null, 204);
  });

  route.post('/:id/run-now', (c) => {
    const id = c.req.param('id');
    if (!deps.crons.get(id)) return c.json({ error: 'not_found' }, 404);
    enqueue(deps, 'cron_run_now', id);
    return c.body(null, 204);
  });

  route.delete('/:id', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'not_found' }, 404);
    if (cron.source === 'static') {
      return c.json({ error: 'cannot_delete_static' }, 409);
    }
    enqueue(deps, 'cron_delete', id);
    return c.body(null, 204);
  });
```

- [ ] **Step 4: Inject `CommandRepo` into server + index**

In `apps/api/src/server.ts`'s `AppDeps` add:

```typescript
commandRepo: CommandRepo;
```

And pass it to `buildCronsRoute`:

```typescript
app.route('/api/crons', buildCronsRoute({
  crons: deps.cronRepo,
  cronRuns: deps.cronRunRepo,
  commands: deps.commandRepo,
}));
```

In `apps/api/src/index.ts`:

```typescript
const commands = new CommandRepo(db);
const app = createApp({
  config, db,
  cronRepo: crons, cronRunRepo: cronRuns, commandRepo: commands,
  spaDir,
});
```

- [ ] **Step 5: Update other tests' `makeApp` to construct `CommandRepo` too**

In each existing `*.test.ts` that calls `createApp`, add `commandRepo: new CommandRepo(database)`.

- [ ] **Step 6: Run tests**

Run: `cd apps/api && pnpm test`
Expected: all pass including new mutation tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/crons.ts apps/api/src/server.ts apps/api/src/index.ts apps/api/tests/
git commit -m "feat(api): cron mutations (POST create/pause/resume/run-now + DELETE) via commands table"
```

---

## Phase 4 — API sessions routes

### Task 4.1: JSONL parser (TDD)

**Files:**
- Create: `apps/api/src/lib/read-session-jsonl.ts`
- Create: `apps/api/tests/lib/read-session-jsonl.test.ts`
- Create: `apps/api/tests/fixtures/session.jsonl`

- [ ] **Step 1: Write the fixture file**

`apps/api/tests/fixtures/session.jsonl`:

```
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"abre um PR"}]},"timestamp":"2026-04-16T12:00:00Z","uuid":"msg-1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"feito, aqui está"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"echo ok"}}]},"timestamp":"2026-04-16T12:00:05Z","uuid":"msg-2"}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"ok, obrigado"}]},"timestamp":"2026-04-16T12:00:10Z","uuid":"msg-3"}
```

- [ ] **Step 2: Write the failing test**

`apps/api/tests/lib/read-session-jsonl.test.ts`:

```typescript
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSessionMessages } from '@/lib/read-session-jsonl';

const FIXTURES = join(__dirname, '..', 'fixtures');

describe('readSessionMessages', () => {
  it('returns empty array when file does not exist', () => {
    expect(readSessionMessages(FIXTURES, 'nonexistent')).toEqual([]);
  });

  it('parses user + assistant + tool_use entries', () => {
    // Use the fixture filename without .jsonl suffix as "sessionId"
    const messages = readSessionMessages(FIXTURES, 'session');
    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.text).toBe('abre um PR');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.text).toBe('feito, aqui está');
    expect(messages[1]?.toolCalls).toHaveLength(1);
    expect(messages[1]?.toolCalls[0]?.tool).toBe('Bash');
  });

  it('replaces unparseable lines with a placeholder system message', () => {
    // Fixture with bad JSON (adjust filename + content per setup)
    // Skip if not present
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd apps/api && pnpm test tests/lib/read-session-jsonl.test.ts`

- [ ] **Step 4: Implement the parser**

`apps/api/src/lib/read-session-jsonl.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const contentBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool_use'), name: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('tool_result'), content: z.unknown() }).passthrough(),
]);

const entrySchema = z.object({
  type: z.enum(['user', 'assistant', 'system']),
  message: z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.union([z.string(), z.array(contentBlock)]),
  }),
  timestamp: z.string().optional(),
  uuid: z.string().optional(),
});

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  author: string;
  timestamp: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
}

function extractText(content: string | Array<z.infer<typeof contentBlock>>): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function extractToolCalls(content: string | Array<z.infer<typeof contentBlock>>): Array<{ tool: string; input: unknown }> {
  if (typeof content === 'string') return [];
  return content
    .filter((block): block is { type: 'tool_use'; name: string; input: unknown } => block.type === 'tool_use')
    .map((block) => ({ tool: block.name, input: block.input }));
}

export function readSessionMessages(claudeHome: string, sessionId: string): SessionMessage[] {
  const path = join(claudeHome, `${sessionId}.jsonl`);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index): SessionMessage => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return {
          id: `unparseable-${index}`,
          role: 'system',
          author: '(system)',
          timestamp: new Date(0).toISOString(),
          text: `[unparseable line ${index + 1}]`,
          toolCalls: [],
        };
      }
      const parsed = entrySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          id: `invalid-${index}`,
          role: 'system',
          author: '(system)',
          timestamp: new Date(0).toISOString(),
          text: `[invalid shape line ${index + 1}]`,
          toolCalls: [],
        };
      }
      const entry = parsed.data;
      return {
        id: entry.uuid ?? `idx-${index}`,
        role: entry.type,
        author: entry.type === 'user' ? 'Operator' : entry.type === 'assistant' ? 'Zeno' : '(system)',
        timestamp: entry.timestamp ?? new Date(0).toISOString(),
        text: extractText(entry.message.content),
        toolCalls: extractToolCalls(entry.message.content),
      };
    });
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/api && pnpm test tests/lib/read-session-jsonl.test.ts`
Expected: 2 passing tests (3rd is conditional).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/read-session-jsonl.ts apps/api/tests/lib/read-session-jsonl.test.ts apps/api/tests/fixtures/session.jsonl
git commit -m "feat(api): SDK JSONL parser (TDD with fixture)"
```

---

### Task 4.2: GET /api/sessions + /api/sessions/:threadId

**Files:**
- Create: `apps/api/src/routes/sessions.ts`
- Create: `apps/api/tests/routes/sessions.test.ts`
- Modify: `apps/api/src/server.ts` (mount)
- Modify: `apps/api/src/index.ts` (pass `claudeHome` path)

- [ ] **Step 1: Write the failing test**

`apps/api/tests/routes/sessions.test.ts`:

```typescript
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DB,
  CommandRepo,
  CronRepo,
  CronRunRepo,
  SessionRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let claudeHome: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  claudeHome = mkdtempSync(join(tmpdir(), 'zeno-claude-'));
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw', sessionSecret: SECRET, logLevel: 'info',
      workspaceDir: '/tmp', nodeEnv: 'test', port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    claudeHome,
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/sessions', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/sessions');
    expect(res.status).toBe(401);
  });

  it('returns sessions ordered by last_used_at desc', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-old', 'sess-1');
    db.prepare("UPDATE sessions SET last_used_at = datetime('now','-2 days') WHERE thread_id='thread-old'").run();
    sessions.upsert('thread-new', 'sess-2');
    const res = await makeApp(db).request('/api/sessions', { headers: authed() });
    const body = (await res.json()) as Array<{ threadId: string }>;
    expect(body[0]?.threadId).toBe('thread-new');
  });
});

describe('GET /api/sessions/:threadId', () => {
  it('returns 404 when thread unknown', async () => {
    const res = await makeApp(db).request('/api/sessions/nope', { headers: authed() });
    expect(res.status).toBe(404);
  });

  it('returns session + parsed messages when JSONL exists', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-1', 'sess-abc');
    writeFileSync(
      join(claudeHome, 'sess-abc.jsonl'),
      `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"oi"}]},"uuid":"u1"}\n`,
    );
    const res = await makeApp(db).request('/api/sessions/thread-1', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { threadId: string }; messages: Array<{ text: string }> };
    expect(body.session.threadId).toBe('thread-1');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.text).toBe('oi');
  });

  it('returns session with empty messages if JSONL missing', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-2', 'sess-no-file');
    const res = await makeApp(db).request('/api/sessions/thread-2', { headers: authed() });
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && pnpm test tests/routes/sessions.test.ts`

- [ ] **Step 3: Implement `apps/api/src/routes/sessions.ts`**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { SessionRepo } from '@zeno/storage';
import { readSessionMessages } from '@/lib/read-session-jsonl';

export interface SessionsRouteDeps {
  sessions: SessionRepo;
  claudeHome: string;
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function buildSessionsRoute(deps: SessionsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', zValidator('query', listQuery), (c) => {
    const { limit } = c.req.valid('query');
    const all = deps.sessions.list();
    // list() already orders by last_used_at DESC (see SessionRepo)
    return c.json(all.slice(0, limit));
  });

  route.get('/:threadId', (c) => {
    const threadId = c.req.param('threadId');
    const all = deps.sessions.list();
    const session = all.find((s) => s.threadId === threadId);
    if (!session) return c.json({ error: 'not_found' }, 404);
    const messages = readSessionMessages(deps.claudeHome, session.sessionId);
    return c.json({ session, messages });
  });

  return route;
}
```

- [ ] **Step 4: Add `SessionRepo.list()` ordered by `last_used_at`**

Check `packages/storage/src/repos/sessions.ts` — if `list()` doesn't already order by `last_used_at DESC`, update it:

```typescript
list(): Session[] {
  const rows = this.db
    .prepare('SELECT * FROM sessions ORDER BY last_used_at DESC')
    .all() as SessionRow[];
  return rows.map(rowToSession);
}
```

Ensure `Session` type has `threadId`, `sessionId`, `createdAt`, `lastUsedAt` matching `rowToSession`.

- [ ] **Step 5: Mount + wire `claudeHome` path**

In `apps/api/src/server.ts` add to `AppDeps`:

```typescript
claudeHome: string;  // e.g. '/home/node/.claude/projects/-workspace'
```

Pass to `buildSessionsRoute`. In `apps/api/src/index.ts`:

```typescript
import { homedir } from 'node:os';
const claudeHome = join(homedir(), '.claude', 'projects', '-workspace');
const app = createApp({ ..., claudeHome });
```

(In the container the worker user's home is `/home/node`, so this resolves correctly.)

- [ ] **Step 6: Run tests**

Run: `cd apps/api && pnpm test`
Expected: all pass with new 5 sessions tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/server.ts apps/api/src/index.ts apps/api/tests/routes/sessions.test.ts packages/storage/src/repos/sessions.ts
git commit -m "feat(api): GET /api/sessions + /api/sessions/:threadId with JSONL transcript"
```

---

## Phase 5 — API settings routes

### Task 5.1: `mcp-snapshot.ts` (duplicate of worker's loadMcpConfig)

**Files:**
- Create: `apps/api/src/lib/mcp-snapshot.ts`
- Create: `apps/api/tests/lib/mcp-snapshot.test.ts`

- [ ] **Step 1: Read the worker's `loadMcpConfig` implementation**

Run: `cat apps/worker/src/agent/mcp.ts`
Review it. Copy the PROFILE_CANDIDATES, interpolation, and status-classification logic.

- [ ] **Step 2: Write the failing test**

`apps/api/tests/lib/mcp-snapshot.test.ts`:

```typescript
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { mcpSnapshot } from '@/lib/mcp-snapshot';

let profileDir: string;

beforeEach(() => {
  profileDir = mkdtempSync(join(tmpdir(), 'zeno-mcp-'));
});

describe('mcpSnapshot', () => {
  it('returns empty list when mcp.json missing', () => {
    expect(mcpSnapshot(profileDir)).toEqual([]);
  });

  it('classifies enabled servers with resolved env', () => {
    process.env.TEST_TOKEN_ABC = 'ok';
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: { foo: { command: 'x', env: { T: '${TEST_TOKEN_ABC}' } } },
      }),
    );
    const snap = mcpSnapshot(profileDir);
    expect(snap).toEqual([{ name: 'foo', status: 'enabled' }]);
    delete process.env.TEST_TOKEN_ABC;
  });

  it('classifies _disabled: true as disabled', () => {
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { foo: { command: 'x', _disabled: true } } }),
    );
    expect(mcpSnapshot(profileDir)).toEqual([{ name: 'foo', status: 'disabled' }]);
  });

  it('classifies missing env as skipped with reason', () => {
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: { foo: { command: 'x', env: { T: '${MISSING_ENV_VAR_42}' } } },
      }),
    );
    expect(mcpSnapshot(profileDir)).toEqual([
      { name: 'foo', status: 'skipped', reason: 'missing env: MISSING_ENV_VAR_42' },
    ]);
  });

  it('returns empty on malformed JSON', () => {
    writeFileSync(join(profileDir, 'mcp.json'), 'not json');
    expect(mcpSnapshot(profileDir)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `apps/api/src/lib/mcp-snapshot.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type McpStatus = 'enabled' | 'disabled' | 'skipped';

export interface McpSnapshotEntry {
  name: string;
  status: McpStatus;
  reason?: string;
}

interface FileEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  _disabled?: boolean;
  [k: string]: unknown;
}

interface FileShape {
  mcpServers?: Record<string, FileEntry>;
}

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

function missingEnvVar(env: Record<string, string> | undefined): string | null {
  if (!env) return null;
  for (const value of Object.values(env)) {
    const match = ENV_VAR_PATTERN.exec(value);
    ENV_VAR_PATTERN.lastIndex = 0;
    if (match && match[1]) {
      if (process.env[match[1]] === undefined || process.env[match[1]] === '') {
        return match[1];
      }
    }
  }
  return null;
}

export function mcpSnapshot(profileDir: string): McpSnapshotEntry[] {
  const path = join(profileDir, 'mcp.json');
  if (!existsSync(path)) return [];
  let parsed: FileShape;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as FileShape;
  } catch {
    return [];
  }
  const out: McpSnapshotEntry[] = [];
  for (const [name, entry] of Object.entries(parsed.mcpServers ?? {})) {
    if (entry._disabled) {
      out.push({ name, status: 'disabled' });
      continue;
    }
    const missing = missingEnvVar(entry.env);
    if (missing) {
      out.push({ name, status: 'skipped', reason: `missing env: ${missing}` });
      continue;
    }
    out.push({ name, status: 'enabled' });
  }
  return out;
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && pnpm test tests/lib/mcp-snapshot.test.ts`
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/mcp-snapshot.ts apps/api/tests/lib/mcp-snapshot.test.ts
git commit -m "feat(api): mcp-snapshot helper (duplicates loadMcpConfig classification)"
```

---

### Task 5.2: GET /api/settings + POST /api/settings/restart

**Files:**
- Create: `apps/api/src/routes/settings.ts`
- Create: `apps/api/tests/routes/settings.test.ts`
- Modify: `apps/api/src/server.ts` (mount)
- Modify: `apps/api/src/index.ts` (pass `profileDir`)

- [ ] **Step 1: Write failing tests**

`apps/api/tests/routes/settings.test.ts`:

```typescript
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DB,
  CommandRepo,
  CronRepo,
  CronRunRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let profileDir: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  profileDir = mkdtempSync(join(tmpdir(), 'zeno-profile-'));
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw', sessionSecret: SECRET, logLevel: 'info',
      workspaceDir: '/tmp', nodeEnv: 'test', port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    claudeHome: '/tmp',
    profileDir,
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/settings', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/settings');
    expect(res.status).toBe(401);
  });

  it('returns backend + mcp + profile files', async () => {
    writeFileSync(join(profileDir, 'SOUL.md'), '# Zeno');
    writeFileSync(join(profileDir, 'crons.yaml'), 'crons: []');
    writeFileSync(join(profileDir, 'mcp.json'), JSON.stringify({ mcpServers: { foo: { command: 'x' } } }));
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      backend: { name: string };
      mcpServers: Array<{ name: string; status: string }>;
      profileFiles: Array<{ path: string }>;
    };
    expect(body.backend.name).toBe('claude-code'); // default
    expect(body.mcpServers.some((s) => s.name === 'foo')).toBe(true);
    const paths = body.profileFiles.map((f) => f.path);
    expect(paths).toContain('SOUL.md');
    expect(paths).toContain('crons.yaml');
  });
});

describe('POST /api/settings/restart', () => {
  it('enqueues worker_restart', async () => {
    const res = await makeApp(db).request('/api/settings/restart', {
      method: 'POST',
      headers: authed(),
    });
    expect(res.status).toBe(204);
    const pending = new CommandRepo(db).claimPending(1);
    expect(pending[0]?.type).toBe('worker_restart');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `apps/api/src/routes/settings.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { CommandRepo } from '@zeno/storage';
import { mcpSnapshot } from '@/lib/mcp-snapshot';

const TRACKED_FILES = ['SOUL.md', 'USER.md', 'crons.yaml', 'mcp.json'] as const;

export interface SettingsRouteDeps {
  commands: CommandRepo;
  profileDir: string;
}

interface ProfileFile {
  path: string;
  bytes: number;
  mtime: string;
}

function readProfileFiles(profileDir: string): ProfileFile[] {
  const out: ProfileFile[] = [];
  for (const name of TRACKED_FILES) {
    const abs = join(profileDir, name);
    if (!existsSync(abs)) continue;
    const stat = statSync(abs);
    out.push({ path: name, bytes: stat.size, mtime: stat.mtime.toISOString() });
  }
  return out;
}

export function buildSettingsRoute(deps: SettingsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    const backendName = process.env.ZENO_BACKEND ?? 'claude-code';
    return c.json({
      backend: { name: backendName, selectedVia: 'ZENO_BACKEND env' },
      mcpServers: mcpSnapshot(deps.profileDir),
      profileFiles: readProfileFiles(deps.profileDir),
    });
  });

  route.post('/restart', (c) => {
    deps.commands.enqueue({
      type: 'worker_restart',
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  return route;
}
```

- [ ] **Step 4: Mount + add `profileDir` to AppDeps**

In `apps/api/src/server.ts` add to `AppDeps`:

```typescript
profileDir: string;
```

Mount:

```typescript
app.use('/api/settings', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.use('/api/settings/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.route('/api/settings', buildSettingsRoute({
  commands: deps.commandRepo,
  profileDir: deps.profileDir,
}));
```

In `apps/api/src/index.ts`:

```typescript
const profileDir = existsSync('/app/profile') ? '/app/profile' : 'profile';
const app = createApp({ ..., profileDir });
```

(Mirror the PROFILE_CANDIDATES pattern from the worker.)

- [ ] **Step 5: Run tests**

Run: `cd apps/api && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/settings.ts apps/api/src/server.ts apps/api/src/index.ts apps/api/tests/routes/settings.test.ts
git commit -m "feat(api): GET /api/settings + POST /api/settings/restart"
```

---

## Phase 6 — Dashboard infra

### Task 6.1: Sidebar activation + mutation helper + Dialog primitive

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`
- Create: `apps/dashboard/src/lib/invalidate-soon.ts`
- Create: `apps/dashboard/src/components/ui/dialog.tsx`
- Modify: `apps/dashboard/package.json` (add `@radix-ui/react-dialog`)

- [ ] **Step 1: Install Radix Dialog**

```bash
cd apps/dashboard
pnpm add @radix-ui/react-dialog
cd ../..
pnpm install
```

- [ ] **Step 2: Activate sidebar nav items**

Edit `apps/dashboard/src/components/layout/Sidebar.tsx`:

```typescript
const navItems: ReadonlyArray<NavItem> = [
  { label: 'Home', to: '/', enabled: true },
  { label: 'Crons', to: '/crons', enabled: true },
  { label: 'Sessions', to: '/sessions', enabled: true },
  { label: 'Settings', to: '/settings', enabled: true },
  { label: 'Logs', to: '/logs', enabled: false },
];
```

(Phase C activates Logs.)

- [ ] **Step 3: Write the invalidate-soon helper**

`apps/dashboard/src/lib/invalidate-soon.ts`:

```typescript
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * After a fire-and-forget mutation, invalidate the listed query keys after a
 * short delay so the worker has time to process the command. 1500ms is the
 * default (1s poll tick + 500ms handler buffer).
 */
export function invalidateSoon(
  queryClient: QueryClient,
  keys: QueryKey[],
  delayMs = 1500,
): void {
  setTimeout(() => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, delayMs);
}
```

- [ ] **Step 4: Write the Dialog primitive**

`apps/dashboard/src/components/ui/dialog.tsx`:

```typescript
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentPropsWithoutRef, ElementRef, JSX, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-sm', className)}
      {...props}
    />
  );
});

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { children: ReactNode }
>(function DialogContent({ className, children, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border border-border-subtle bg-panel p-8 shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('font-serif text-2xl leading-tight text-text-primary', className)}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
});

export function DialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex justify-end gap-3">{children}</div>;
}
```

- [ ] **Step 5: Typecheck + build**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard pnpm-lock.yaml
git commit -m "feat(dashboard): enable all nav items + invalidateSoon helper + Dialog primitive"
```

---

## Phase 7 — Dashboard crons

### Task 7.1: Crons list route + row component

**Files:**
- Create: `apps/dashboard/src/routes/_authed/crons.tsx`
- Create: `apps/dashboard/src/components/crons/CronRow.tsx`
- Create: `apps/dashboard/src/components/crons/CronStatusPill.tsx`
- Create: `apps/dashboard/src/lib/use-crons.ts`

- [ ] **Step 1: Write `use-crons.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface CronApi {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: boolean;
  source: 'static' | 'chat';
  createdBy: string | null;
  notifyConversationId: string | null;
  notifyThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export function useCrons() {
  return useQuery({
    queryKey: ['crons'],
    queryFn: () => apiFetch<CronApi[]>('/api/crons'),
  });
}
```

- [ ] **Step 2: Write `CronStatusPill.tsx`**

```typescript
import type { JSX } from 'react';
import type { CronApi } from '@/lib/use-crons';

export function CronStatusPill({ cron }: { cron: CronApi }): JSX.Element {
  const color = cron.enabled ? 'bg-status-active' : 'bg-status-paused';
  const label = cron.enabled ? 'Active' : 'Paused';
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
      <span className="text-sm text-text-primary">{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Write `CronRow.tsx`**

```typescript
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { CronStatusPill } from '@/components/crons/CronStatusPill';
import type { CronApi } from '@/lib/use-crons';

export function CronRow({ cron }: { cron: CronApi }): JSX.Element {
  return (
    <Link
      to="/crons/$id"
      params={{ id: cron.id }}
      className="flex items-center gap-4 border-b border-panel py-4 hover:bg-panel/40"
    >
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <span className="text-sm font-medium text-text-primary">{cron.name}</span>
        {cron.description && (
          <span className="truncate text-xs text-text-secondary">{cron.description}</span>
        )}
      </div>
      <span className="w-40 shrink-0 font-mono text-sm text-text-primary">{cron.schedule}</span>
      <span className="w-24 shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-center text-[11px] uppercase tracking-wider text-text-secondary">
        {cron.source}
      </span>
      <div className="w-24 shrink-0">
        <CronStatusPill cron={cron} />
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Write `crons.tsx` route**

```typescript
import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { CronRow } from '@/components/crons/CronRow';
import { Button } from '@/components/ui/button';
import { useCrons } from '@/lib/use-crons';

export const Route = createFileRoute('/_authed/crons')({
  component: CronsPage,
});

function CronsPage(): JSX.Element {
  const crons = useCrons();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Scheduled tasks
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Crons</h1>
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
            Recurring tasks. Static lives in <span className="font-mono">profile/crons.yaml</span>;
            chat-source crons came from Slack or the dashboard.
          </p>
        </div>
        <Link to="/crons/new">
          <Button variant="outline">+ New cron</Button>
        </Link>
      </header>

      <section className="flex flex-col">
        <div className="flex items-center gap-4 border-b border-border-subtle py-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          <span className="flex-1">Name</span>
          <span className="w-40 shrink-0">Schedule</span>
          <span className="w-24 shrink-0">Source</span>
          <span className="w-24 shrink-0">Status</span>
        </div>
        {crons.isLoading && <span className="py-4 text-sm text-text-secondary">carregando…</span>}
        {crons.data?.length === 0 && (
          <span className="py-4 text-sm text-text-secondary">nenhum cron ainda</span>
        )}
        {crons.data?.map((c) => (
          <CronRow key={c.id} cron={c} />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Build + verify route generation**

```bash
cd apps/dashboard && pnpm build
```

Expected: `src/route-tree.gen.ts` regenerates with `/_authed/crons` route.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/routes/_authed/crons.tsx apps/dashboard/src/components/crons/ apps/dashboard/src/lib/use-crons.ts
git commit -m "feat(dashboard): /crons list page with row component"
```

---

### Task 7.2: Cron detail route

**Files:**
- Create: `apps/dashboard/src/routes/_authed/crons.$id.tsx`
- Create: `apps/dashboard/src/components/crons/CronRunHistoryRow.tsx`
- Create: `apps/dashboard/src/lib/use-cron.ts`

- [ ] **Step 1: Write `use-cron.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CronApi } from '@/lib/use-crons';

export interface CronRunApi {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed' | 'skipped';
  output: string | null;
  error: string | null;
}

export function useCron(id: string) {
  return useQuery({
    queryKey: ['crons', id],
    queryFn: () => apiFetch<{ cron: CronApi; recentRuns: CronRunApi[] }>(`/api/crons/${id}`),
  });
}
```

- [ ] **Step 2: Write `CronRunHistoryRow.tsx`**

```typescript
import type { JSX } from 'react';
import type { CronRunApi } from '@/lib/use-cron';

const statusColor: Record<CronRunApi['status'], string> = {
  running: 'bg-status-active',
  success: 'bg-status-active',
  failed: 'bg-status-failed',
  skipped: 'bg-text-tertiary',
};

function duration(run: CronRunApi): string {
  if (!run.finishedAt) return '…';
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

export function CronRunHistoryRow({ run }: { run: CronRunApi }): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-panel py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        <span className={`h-1.5 w-1.5 rounded-full ${statusColor[run.status]}`} />
      </span>
      <span className="w-40 shrink-0 font-mono text-xs text-text-tertiary">{run.startedAt}</span>
      <span className="w-16 shrink-0 text-sm text-text-secondary">{duration(run)}</span>
      <span className="flex-1 truncate text-sm text-text-primary">
        {run.status === 'failed' ? run.error : run.output ?? '(no output)'}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Write the detail route**

`apps/dashboard/src/routes/_authed/crons.$id.tsx`:

```typescript
import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { CronRunHistoryRow } from '@/components/crons/CronRunHistoryRow';
import { CronStatusPill } from '@/components/crons/CronStatusPill';
import { useCron } from '@/lib/use-cron';

export const Route = createFileRoute('/_authed/crons/$id')({
  component: CronDetailPage,
});

function CronDetailPage(): JSX.Element {
  const { id } = Route.useParams();
  const q = useCron(id);

  if (q.isLoading) return <span className="text-sm text-text-secondary">carregando…</span>;
  if (q.isError || !q.data) return <span className="text-sm text-status-failed">cron não encontrado</span>;

  const { cron, recentRuns } = q.data;

  return (
    <div className="flex flex-col gap-10">
      <nav className="text-xs text-text-tertiary">
        <Link to="/crons" className="hover:text-text-secondary">Crons</Link>
        <span className="mx-2">/</span>
        <span className="text-text-secondary">{cron.name}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl leading-tight text-text-primary">{cron.name}</h1>
        {cron.description && <p className="max-w-[640px] text-sm text-text-secondary">{cron.description}</p>}
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border-subtle bg-panel px-2.5 py-1 font-mono text-xs text-text-primary">
            {cron.schedule}
          </span>
          <CronStatusPill cron={cron} />
          <span className="text-xs text-text-tertiary">source <span className="text-text-primary">{cron.source}</span></span>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Prompt</span>
        <pre className="whitespace-pre-wrap rounded-lg border border-border-subtle bg-panel p-5 font-mono text-xs text-text-primary">
          {cron.prompt}
        </pre>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-text-primary">Run history</h2>
        {recentRuns.length === 0 && <span className="text-sm text-text-secondary">ainda não rodou</span>}
        {recentRuns.map((r) => <CronRunHistoryRow key={r.id} run={r} />)}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Build + verify**

```bash
cd apps/dashboard && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/routes/_authed/crons.\$id.tsx apps/dashboard/src/components/crons/CronRunHistoryRow.tsx apps/dashboard/src/lib/use-cron.ts
git commit -m "feat(dashboard): /crons/:id detail page with prompt + run history"
```

---

### Task 7.3: Cron actions (pause/resume/run-now/delete) + mutations

**Files:**
- Create: `apps/dashboard/src/lib/mutations.ts`
- Create: `apps/dashboard/src/components/crons/CronActions.tsx`
- Modify: `apps/dashboard/src/routes/_authed/crons.$id.tsx` (render actions)
- Modify: `apps/dashboard/src/components/crons/CronRow.tsx` (show compact action menu if desired — simpler: only actions on detail for Phase B)

- [ ] **Step 1: Write `mutations.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';
import { invalidateSoon } from '@/lib/invalidate-soon';

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    if (typeof err.body === 'object' && err.body && 'error' in err.body) {
      const e = (err.body as { error: unknown }).error;
      if (typeof e === 'string') return e;
    }
    return `erro ${err.status}`;
  }
  return err instanceof Error ? err.message : 'erro desconhecido';
}

export function usePauseCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}/pause`, { method: 'POST' }),
    onSuccess: (_r, id) => {
      toast.success('cron pausado');
      invalidateSoon(qc, [['crons'], ['crons', id]]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useResumeCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}/resume`, { method: 'POST' }),
    onSuccess: (_r, id) => {
      toast.success('cron retomado');
      invalidateSoon(qc, [['crons'], ['crons', id]]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useRunNowCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}/run-now`, { method: 'POST' }),
    onSuccess: (_r, id) => {
      toast.success('execução iniciada');
      invalidateSoon(qc, [['crons', id]], 5000); // gives the runner time to at least insert the run
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useDeleteCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('cron removido');
      invalidateSoon(qc, [['crons']]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export interface CreateCronInput {
  name: string;
  description?: string;
  prompt: string;
  schedule: string;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
}

export function useCreateCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCronInput) =>
      apiFetch<void>('/api/crons', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success('cron criado');
      invalidateSoon(qc, [['crons']]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useRestartWorker() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/settings/restart', { method: 'POST' }),
    onSuccess: () => toast.success('reiniciando worker…'),
    onError: (err) => toast.error(formatError(err)),
  });
}
```

- [ ] **Step 2: Write `CronActions.tsx`**

```typescript
import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import {
  usePauseCron,
  useResumeCron,
  useRunNowCron,
  useDeleteCron,
} from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

export function CronActions({ cron }: { cron: CronApi }): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();
  const navigate = useNavigate();

  const onDelete = (): void => {
    const confirmed = window.confirm(`remover cron "${cron.name}"? essa ação não pode ser desfeita.`);
    if (!confirmed) return;
    deleteCron.mutate(cron.id, {
      onSuccess: () => { void navigate({ to: '/crons' }); },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="accent"
        size="sm"
        disabled={runNow.isPending || !cron.enabled}
        onClick={() => runNow.mutate(cron.id)}
      >
        ▶ Run now
      </Button>
      {cron.enabled ? (
        <Button variant="outline" size="sm" disabled={pause.isPending} onClick={() => pause.mutate(cron.id)}>
          Pause
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={resume.isPending} onClick={() => resume.mutate(cron.id)}>
          Resume
        </Button>
      )}
      {cron.source === 'chat' && (
        <Button variant="ghost" size="sm" disabled={deleteCron.isPending} onClick={onDelete}>
          Delete
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render `CronActions` in the detail route**

Edit `apps/dashboard/src/routes/_authed/crons.$id.tsx` header section to include `<CronActions cron={cron} />` on the right side.

- [ ] **Step 4: Build + typecheck**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/lib/mutations.ts apps/dashboard/src/components/crons/CronActions.tsx apps/dashboard/src/routes/_authed/crons.\$id.tsx
git commit -m "feat(dashboard): cron mutation hooks + CronActions (pause/resume/run-now/delete)"
```

---

### Task 7.4: Cron create modal

**Files:**
- Create: `apps/dashboard/src/routes/_authed/crons.new.tsx`
- Create: `apps/dashboard/src/components/crons/CronForm.tsx`

- [ ] **Step 1: Write `CronForm.tsx`**

```typescript
import { type FormEvent, type JSX, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type CreateCronInput } from '@/lib/mutations';

export function CronForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: CreateCronInput) => void;
  submitting: boolean;
}): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('');
  const [prompt, setPrompt] = useState('');
  const [notifyConversationId, setNotifyConversationId] = useState('');

  const handle = (e: FormEvent): void => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      schedule,
      prompt,
      notifyConversationId: notifyConversationId || null,
    });
  };

  return (
    <form onSubmit={handle} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Name *</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} required pattern="[a-z0-9][a-z0-9-]*" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Description</span>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Schedule *</span>
        <Input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="0 9 * * 1-5"
          required
          className="font-mono"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Prompt *</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          rows={5}
          className="rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          Slack channel id (optional)
        </span>
        <Input
          value={notifyConversationId}
          onChange={(e) => setNotifyConversationId(e.target.value)}
          placeholder="C12345ABC"
          className="font-mono"
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'criando…' : 'Criar cron'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write the modal route**

`apps/dashboard/src/routes/_authed/crons.new.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { CronForm } from '@/components/crons/CronForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateCron } from '@/lib/mutations';

export const Route = createFileRoute('/_authed/crons/new')({
  component: NewCronPage,
});

function NewCronPage(): JSX.Element {
  const navigate = useNavigate();
  const create = useCreateCron();

  const onOpenChange = (open: boolean): void => {
    if (!open) void navigate({ to: '/crons' });
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New cron</DialogTitle>
          <DialogDescription>Scheduled task that runs through the agent.</DialogDescription>
        </DialogHeader>
        <CronForm
          submitting={create.isPending}
          onSubmit={(input) => {
            create.mutate(input, {
              onSuccess: () => void navigate({ to: '/crons' }),
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Build + verify**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/_authed/crons.new.tsx apps/dashboard/src/components/crons/CronForm.tsx
git commit -m "feat(dashboard): new cron modal route with form"
```

---

## Phase 8 — Dashboard sessions

### Task 8.1: Sessions list

**Files:**
- Create: `apps/dashboard/src/routes/_authed/sessions.tsx`
- Create: `apps/dashboard/src/components/sessions/SessionRow.tsx`
- Create: `apps/dashboard/src/lib/use-sessions.ts`

- [ ] **Step 1: Write `use-sessions.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SessionApi {
  threadId: string;
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<SessionApi[]>('/api/sessions'),
  });
}
```

- [ ] **Step 2: Write `SessionRow.tsx`**

```typescript
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import type { SessionApi } from '@/lib/use-sessions';

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'agora mesmo';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}min atrás`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h atrás`;
  return `${Math.floor(ms / 86_400_000)}d atrás`;
}

export function SessionRow({ session }: { session: SessionApi }): JSX.Element {
  return (
    <Link
      to="/sessions/$threadId"
      params={{ threadId: session.threadId }}
      className="flex items-center gap-4 border-b border-panel py-4 hover:bg-panel/40"
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="truncate font-mono text-sm text-text-primary">{session.threadId}</span>
        <span className="font-mono text-xs text-text-tertiary">{session.sessionId}</span>
      </div>
      <span className="w-32 shrink-0 text-right text-xs text-text-secondary">
        {relativeFrom(session.lastUsedAt)}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Write the route**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { SessionRow } from '@/components/sessions/SessionRow';
import { useSessions } from '@/lib/use-sessions';

export const Route = createFileRoute('/_authed/sessions')({
  component: SessionsPage,
});

function SessionsPage(): JSX.Element {
  const q = useSessions();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Conversations
        </span>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Sessions</h1>
        <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
          Threads de Slack mapeados pra sessões do SDK. Clica pra ver a conversa completa.
        </p>
      </header>
      <section className="flex flex-col">
        {q.isLoading && <span className="py-4 text-sm text-text-secondary">carregando…</span>}
        {q.data?.length === 0 && (
          <span className="py-4 text-sm text-text-secondary">nenhuma sessão ainda</span>
        )}
        {q.data?.map((s) => <SessionRow key={s.threadId} session={s} />)}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
cd apps/dashboard && pnpm build
cd ../..
git add apps/dashboard/src/routes/_authed/sessions.tsx apps/dashboard/src/components/sessions/SessionRow.tsx apps/dashboard/src/lib/use-sessions.ts
git commit -m "feat(dashboard): /sessions list page"
```

---

### Task 8.2: Session transcript

**Files:**
- Create: `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx`
- Create: `apps/dashboard/src/components/sessions/MessageBlock.tsx`
- Create: `apps/dashboard/src/lib/use-session.ts`

- [ ] **Step 1: Write `use-session.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { SessionApi } from '@/lib/use-sessions';

export interface SessionMessageApi {
  id: string;
  role: 'user' | 'assistant' | 'system';
  author: string;
  timestamp: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
}

export function useSession(threadId: string) {
  return useQuery({
    queryKey: ['sessions', threadId],
    queryFn: () =>
      apiFetch<{ session: SessionApi; messages: SessionMessageApi[] }>(
        `/api/sessions/${threadId}`,
      ),
  });
}
```

- [ ] **Step 2: Write `MessageBlock.tsx`**

```typescript
import type { JSX } from 'react';
import type { SessionMessageApi } from '@/lib/use-session';

export function MessageBlock({ message }: { message: SessionMessageApi }): JSX.Element {
  const authorColor = message.role === 'assistant' ? 'text-accent' : 'text-text-primary';
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-xs font-medium ${authorColor}`}>{message.author}</span>
        <span className="text-[11px] text-text-tertiary">{message.timestamp}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-text-primary">{message.text}</div>
      {message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          {message.toolCalls.map((tc, i) => (
            <span key={i} className="font-mono text-[11px] text-text-tertiary">
              → {tc.tool}({typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the route**

```typescript
import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { MessageBlock } from '@/components/sessions/MessageBlock';
import { useSession } from '@/lib/use-session';

export const Route = createFileRoute('/_authed/sessions/$threadId')({
  component: SessionDetailPage,
});

function SessionDetailPage(): JSX.Element {
  const { threadId } = Route.useParams();
  const q = useSession(threadId);

  if (q.isLoading) return <span className="text-sm text-text-secondary">carregando…</span>;
  if (q.isError || !q.data) return <span className="text-sm text-status-failed">sessão não encontrada</span>;

  const { session, messages } = q.data;

  return (
    <div className="flex max-w-[800px] flex-col gap-8">
      <nav className="text-xs text-text-tertiary">
        <Link to="/sessions" className="hover:text-text-secondary">Sessions</Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-text-secondary">{session.threadId}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl leading-tight text-text-primary">{session.threadId}</h1>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>iniciou <span className="text-text-primary">{session.createdAt}</span></span>
          <span>·</span>
          <span>{messages.length} mensagens</span>
          <span>·</span>
          <span>session <span className="font-mono text-text-primary">{session.sessionId}</span></span>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        {messages.length === 0 && <span className="text-sm text-text-secondary">[sem transcript disponível]</span>}
        {messages.map((m) => <MessageBlock key={m.id} message={m} />)}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
cd apps/dashboard && pnpm build
cd ../..
git add apps/dashboard/src/routes/_authed/sessions.\$threadId.tsx apps/dashboard/src/components/sessions/MessageBlock.tsx apps/dashboard/src/lib/use-session.ts
git commit -m "feat(dashboard): /sessions/:threadId transcript view"
```

---

## Phase 9 — Dashboard settings

### Task 9.1: Settings page + restart action

**Files:**
- Create: `apps/dashboard/src/routes/_authed/settings.tsx`
- Create: `apps/dashboard/src/components/settings/ServiceStatus.tsx`
- Create: `apps/dashboard/src/components/settings/ProfileFileRow.tsx`
- Create: `apps/dashboard/src/components/settings/McpServerRow.tsx`
- Create: `apps/dashboard/src/components/settings/RestartDialog.tsx`
- Create: `apps/dashboard/src/lib/use-settings.ts`

- [ ] **Step 1: Write `use-settings.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SettingsSnapshot {
  backend: { name: string; selectedVia: string };
  mcpServers: Array<{ name: string; status: 'enabled' | 'skipped' | 'disabled'; reason?: string }>;
  profileFiles: Array<{ path: string; bytes: number; mtime: string }>;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsSnapshot>('/api/settings'),
  });
}
```

- [ ] **Step 2: Write the three row components**

`apps/dashboard/src/components/settings/McpServerRow.tsx`:

```typescript
import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

const statusColor: Record<SettingsSnapshot['mcpServers'][number]['status'], string> = {
  enabled: 'bg-status-active',
  skipped: 'bg-status-paused',
  disabled: 'bg-text-tertiary',
};

export function McpServerRow({ server }: { server: SettingsSnapshot['mcpServers'][number] }): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-panel py-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColor[server.status]}`} />
      <span className="w-40 font-mono text-sm text-text-primary">{server.name}</span>
      <span className="text-sm text-text-secondary">{server.reason ?? server.status}</span>
    </div>
  );
}
```

`apps/dashboard/src/components/settings/ProfileFileRow.tsx`:

```typescript
import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

export function ProfileFileRow({ file }: { file: SettingsSnapshot['profileFiles'][number] }): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-panel py-2">
      <span className="w-40 font-mono text-sm text-text-primary">{file.path}</span>
      <span className="w-24 text-sm text-text-secondary">{file.bytes.toLocaleString()} bytes</span>
      <span className="text-xs text-text-tertiary">{file.mtime}</span>
    </div>
  );
}
```

`apps/dashboard/src/components/settings/ServiceStatus.tsx`:

```typescript
import type { JSX } from 'react';

export function ServiceStatus({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: 'ok' | 'warn' | 'unknown';
}): JSX.Element {
  const color = status === 'ok' ? 'bg-status-active' : status === 'warn' ? 'bg-status-paused' : 'bg-text-tertiary';
  return (
    <div className="flex items-center gap-3">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="font-mono text-sm text-text-primary">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Write `RestartDialog.tsx`**

```typescript
import type { JSX } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRestartWorker } from '@/lib/mutations';

export function RestartDialog(): JSX.Element {
  const [open, setOpen] = useState(false);
  const restart = useRestartWorker();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Restart worker</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restart worker?</DialogTitle>
          <DialogDescription>
            O processo do worker vai sair e o Docker vai subir de novo em ~3s. A API não é afetada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="accent"
            disabled={restart.isPending}
            onClick={() => {
              restart.mutate();
              setOpen(false);
            }}
          >
            {restart.isPending ? 'reiniciando…' : 'Restart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the settings route**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { McpServerRow } from '@/components/settings/McpServerRow';
import { ProfileFileRow } from '@/components/settings/ProfileFileRow';
import { RestartDialog } from '@/components/settings/RestartDialog';
import { ServiceStatus } from '@/components/settings/ServiceStatus';
import { useSettings } from '@/lib/use-settings';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});

function SettingsPage(): JSX.Element {
  const q = useSettings();
  if (q.isLoading || !q.data) return <span className="text-sm text-text-secondary">carregando…</span>;
  const s = q.data;
  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">System</span>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Settings</h1>
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
            Read-only snapshot. Edit <span className="font-mono">.env</span> and
            <span className="font-mono"> profile/</span> files on disk — the watcher reloads most
            changes; MCP changes require a worker restart.
          </p>
        </div>
        <RestartDialog />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Backend</h2>
        <ServiceStatus label="name" value={s.backend.name} status="ok" />
        <ServiceStatus label="selected via" value={s.backend.selectedVia} status="ok" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">MCP servers</h2>
        {s.mcpServers.length === 0 && <span className="text-sm text-text-secondary">nenhum server configurado</span>}
        {s.mcpServers.map((m) => <McpServerRow key={m.name} server={m} />)}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Profile files</h2>
        {s.profileFiles.map((f) => <ProfileFileRow key={f.path} file={f} />)}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Build + commit**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
cd ../..
git add apps/dashboard
git commit -m "feat(dashboard): /settings page with backend + MCP + profile files + restart"
```

---

## Phase 10 — Final smoke + PR update

### Task 10.1: End-to-end Docker smoke

**Files:**
- (none — verification only)

- [ ] **Step 1: Full quality gate**

Run: `pnpm run quality-gate`
Expected: all green (storage, logger, worker, api, dashboard).

- [ ] **Step 2: Rebuild + boot**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
pnpm run docker:logs 2>&1 | grep -E 'zeno_online|api_listening|commands_poller_started'
```

Expected: all three log lines present.

- [ ] **Step 3: Browser click-through**

Open http://localhost:3000:
- Login with `.env` password
- `/crons`: list renders; open detail; click Pause → toast + status flips within 2s
- `/crons/new`: submit valid form → modal closes, cron appears
- `/sessions`: list renders; open a thread → transcript shows (if a real session exists)
- `/settings`: three sections render; click Restart → toast, worker exits, comes back in ~3s
- Refresh page → still authed

Save a screenshot of each main screen to `tmp/playwright/` (optional — manual only if something looks off).

- [ ] **Step 4: Stop container**

```bash
pnpm run docker:down
```

- [ ] **Step 5: Push**

```bash
git push
```

- [ ] **Step 6: Refresh PR #2 description**

Use `gh pr edit 2` to update the PR body to reflect Phase B completion. Include: commands table + poller summary, new endpoints list, 5 new dashboard routes, total test count. Don't merge — the user merges explicitly.

---

## Done

When all tasks check off, Phase B is complete. Phase C (spec 0014, Logs page) can start from this shipped branch.
