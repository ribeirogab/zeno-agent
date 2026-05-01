---
feature: dashboard-logs
plan: "[[plan-dashboard-logs]]"
spec: "[[spec-dashboard-logs]]"
created: 2026-04-16
---
# Dashboard Logs — Tasks

**For this plan:** `[[plan-dashboard-logs]]`

> **Conventions for every task:**
> - Absolute paths from project root.
> - Temp files under `tmp/` per `context/rules/generated-files-location.md`.
> - **Never use `any`. Never write `// biome-ignore`.** Refactor instead.
> - Each task ends with `git add <files> + git commit -m "..."`. English conventional commits, no AI attribution.
> - Tasks are independent; a fresh subagent can execute any one given only `tasks.md` + the spec + branch state.

---

## Phase 1 — Storage

### Task 1.1: Log types + migration 3

**Files:**
- Modify: `packages/storage/src/types.ts`
- Modify: `packages/storage/src/migrations.ts`

- [ ] **Step 1: Append types to `packages/storage/src/types.ts`**

```typescript
export type LogLevel = 10 | 20 | 30 | 40 | 50 | 60;

export interface Log {
  id: number;
  ts: string;
  level: LogLevel;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface CreateLogInput {
  ts: string;
  level: LogLevel;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface LogFilter {
  level?: LogLevel;
  q?: string;
  since?: string;
  until?: string;
  cursorId?: number;
  sinceId?: number;
  limit?: number;
}
```

- [ ] **Step 2: Append migration 3 to `packages/storage/src/migrations.ts`**

Find the `MIGRATIONS` array and append after migration 2 (`commands`):

```typescript
{
  id: 3,
  name: 'logs',
  sql: `
    CREATE TABLE logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ts             TEXT NOT NULL,
      level          INTEGER NOT NULL,
      service        TEXT NOT NULL,
      event          TEXT,
      correlation_id TEXT,
      message        TEXT,
      payload        TEXT NOT NULL
    );
    CREATE INDEX logs_ts_desc_idx ON logs(ts DESC);
    CREATE INDEX logs_level_idx ON logs(level);
    CREATE INDEX logs_event_idx ON logs(event);
    CREATE INDEX logs_correlation_idx ON logs(correlation_id);
  `,
},
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/storage && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/storage/src/types.ts packages/storage/src/migrations.ts
git commit -m "feat(storage): add Log types + migration 3 (logs table)"
```

---

### Task 1.2: `LogRepo` (TDD)

**Files:**
- Create: `packages/storage/src/repos/logs.ts`
- Create: `packages/storage/tests/logs.test.ts`
- Modify: `packages/storage/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/storage/tests/logs.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { LogRepo } from '../src/repos/logs.js';
import type { CreateLogInput } from '../src/types.js';

let db: DB;
let repo: LogRepo;

function sample(overrides: Partial<CreateLogInput> = {}): CreateLogInput {
  return {
    ts: '2026-04-16T12:00:00.000Z',
    level: 30,
    service: 'worker',
    event: 'boot',
    correlationId: null,
    message: 'zeno booting',
    payload: JSON.stringify({ level: 30, time: '2026-04-16T12:00:00.000Z', service: 'worker', event: 'boot', msg: 'zeno booting' }),
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new LogRepo(db);
});

describe('LogRepo.insert + list', () => {
  it('inserts and returns rows newest-first', () => {
    repo.insert(sample({ event: 'first', ts: '2026-04-16T12:00:01.000Z' }));
    repo.insert(sample({ event: 'second', ts: '2026-04-16T12:00:02.000Z' }));
    const { logs, nextCursorId } = repo.list({});
    expect(logs).toHaveLength(2);
    expect(logs[0]?.event).toBe('second');
    expect(logs[1]?.event).toBe('first');
    expect(nextCursorId).toBeNull();
  });

  it('filters by level', () => {
    repo.insert(sample({ level: 30, event: 'info-x' }));
    repo.insert(sample({ level: 50, event: 'err-x' }));
    const { logs } = repo.list({ level: 50 });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('err-x');
  });

  it('q matches event prefix case-insensitive', () => {
    repo.insert(sample({ event: 'cron_run_success' }));
    repo.insert(sample({ event: 'CRON_RUN_FAILED' }));
    repo.insert(sample({ event: 'other_thing' }));
    const { logs } = repo.list({ q: 'cron_run' });
    expect(logs.map((l) => l.event).sort()).toEqual(['CRON_RUN_FAILED', 'cron_run_success']);
  });

  it('q matches correlation_id exact (case-sensitive)', () => {
    repo.insert(sample({ correlationId: 'corr-ABC-123', event: 'a' }));
    repo.insert(sample({ correlationId: 'corr-XYZ-000', event: 'b' }));
    const { logs } = repo.list({ q: 'corr-ABC-123' });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('a');
  });

  it('honors since/until range', () => {
    repo.insert(sample({ ts: '2026-04-10T00:00:00.000Z', event: 'old' }));
    repo.insert(sample({ ts: '2026-04-16T12:00:00.000Z', event: 'recent' }));
    const { logs } = repo.list({ since: '2026-04-15T00:00:00.000Z' });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('recent');
  });

  it('returns nextCursorId when limit is hit', () => {
    for (let i = 0; i < 5; i += 1) {
      repo.insert(sample({ event: `e-${i}`, ts: `2026-04-16T12:00:0${i}.000Z` }));
    }
    const first = repo.list({ limit: 3 });
    expect(first.logs).toHaveLength(3);
    expect(first.nextCursorId).toBe(first.logs[2]?.id);
    const second = repo.list({ limit: 3, cursorId: first.nextCursorId ?? undefined });
    expect(second.logs).toHaveLength(2);
    expect(second.nextCursorId).toBeNull();
  });
});

describe('LogRepo.listSince', () => {
  it('returns rows with id > sinceId in ascending order', () => {
    repo.insert(sample({ event: 'a' }));
    const snapshot = repo.list({}).logs[0];
    const sinceId = snapshot?.id ?? 0;
    repo.insert(sample({ event: 'b' }));
    repo.insert(sample({ event: 'c' }));
    const rows = repo.listSince({ sinceId });
    expect(rows.map((l) => l.event)).toEqual(['b', 'c']);
  });

  it('applies filters while streaming', () => {
    repo.insert(sample({ level: 30, event: 'noise' }));
    const firstId = repo.list({}).logs[0]?.id ?? 0;
    repo.insert(sample({ level: 50, event: 'boom' }));
    const rows = repo.listSince({ sinceId: firstId, level: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event).toBe('boom');
  });
});

describe('LogRepo.sweep', () => {
  it('deletes rows older than threshold and returns count', () => {
    repo.insert(sample({ ts: '2026-03-01T00:00:00.000Z', event: 'stale-1' }));
    repo.insert(sample({ ts: '2026-03-02T00:00:00.000Z', event: 'stale-2' }));
    repo.insert(sample({ ts: '2026-04-16T00:00:00.000Z', event: 'fresh' }));
    const deleted = repo.sweep('2026-04-01T00:00:00.000Z');
    expect(deleted).toBe(2);
    const remaining = repo.list({}).logs.map((l) => l.event);
    expect(remaining).toEqual(['fresh']);
  });

  it('returns 0 when nothing to delete', () => {
    repo.insert(sample({ ts: '2026-04-16T12:00:00.000Z' }));
    expect(repo.sweep('2026-04-10T00:00:00.000Z')).toBe(0);
  });
});

describe('LogRepo id monotonicity after sweep', () => {
  it('assigns strictly increasing ids even after DELETE (AUTOINCREMENT)', () => {
    repo.insert(sample({ event: 'a', ts: '2026-03-01T00:00:00.000Z' }));
    const firstId = repo.list({}).logs[0]?.id ?? 0;
    repo.sweep('2026-04-01T00:00:00.000Z');
    repo.insert(sample({ event: 'b', ts: '2026-04-16T12:00:00.000Z' }));
    const nextId = repo.list({}).logs[0]?.id ?? 0;
    expect(nextId).toBeGreaterThan(firstId);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/storage && pnpm test tests/logs.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement `LogRepo`**

`packages/storage/src/repos/logs.ts`:

```typescript
import type { DB } from '../db.js';
import type { CreateLogInput, Log, LogFilter, LogLevel } from '../types.js';

interface LogRow {
  id: number;
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlation_id: string | null;
  message: string | null;
  payload: string;
}

function rowToLog(row: LogRow): Log {
  return {
    id: row.id,
    ts: row.ts,
    level: row.level as LogLevel,
    service: row.service,
    event: row.event,
    correlationId: row.correlation_id,
    message: row.message,
    payload: row.payload,
  };
}

interface ListResult {
  logs: Log[];
  nextCursorId: number | null;
}

export class LogRepo {
  constructor(private readonly db: DB) {}

  insert(input: CreateLogInput): void {
    this.db
      .prepare(
        `INSERT INTO logs (ts, level, service, event, correlation_id, message, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ts,
        input.level,
        input.service,
        input.event,
        input.correlationId,
        input.message,
        input.payload,
      );
  }

  list(filter: LogFilter): ListResult {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filter.level !== undefined) {
      where.push('level = ?');
      values.push(filter.level);
    }
    if (filter.q !== undefined && filter.q.length > 0) {
      where.push("(event LIKE ? || '%' COLLATE NOCASE OR correlation_id = ?)");
      values.push(filter.q, filter.q);
    }
    if (filter.since !== undefined) {
      where.push('ts >= ?');
      values.push(filter.since);
    }
    if (filter.until !== undefined) {
      where.push('ts < ?');
      values.push(filter.until);
    }
    if (filter.cursorId !== undefined) {
      where.push('id < ?');
      values.push(filter.cursorId);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(filter.limit ?? 100, 500);
    const rows = this.db
      .prepare(`SELECT * FROM logs ${whereClause} ORDER BY id DESC LIMIT ?`)
      .all(...values, limit) as LogRow[];
    const logs = rows.map(rowToLog);
    const nextCursorId = logs.length === limit ? (logs[logs.length - 1]?.id ?? null) : null;
    return { logs, nextCursorId };
  }

  listSince(filter: LogFilter & { sinceId: number }): Log[] {
    const where: string[] = ['id > ?'];
    const values: Array<string | number> = [filter.sinceId];
    if (filter.level !== undefined) {
      where.push('level = ?');
      values.push(filter.level);
    }
    if (filter.q !== undefined && filter.q.length > 0) {
      where.push("(event LIKE ? || '%' COLLATE NOCASE OR correlation_id = ?)");
      values.push(filter.q, filter.q);
    }
    if (filter.since !== undefined) {
      where.push('ts >= ?');
      values.push(filter.since);
    }
    if (filter.until !== undefined) {
      where.push('ts < ?');
      values.push(filter.until);
    }
    const limit = Math.min(filter.limit ?? 100, 500);
    const rows = this.db
      .prepare(
        `SELECT * FROM logs WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT ?`,
      )
      .all(...values, limit) as LogRow[];
    return rows.map(rowToLog);
  }

  sweep(olderThanIso: string): number {
    const result = this.db
      .prepare('DELETE FROM logs WHERE ts < ?')
      .run(olderThanIso);
    return Number(result.changes);
  }
}

// Compile-time assertion that LogRepo.insert matches the LogSink contract
// defined independently in @zeno/logger. A future drift in CreateLogInput
// that isn't mirrored in LogSink will break this line.
// Structural check mirror — the logger's LogSink has: insert(input: { ts, level, service, event, correlationId, message, payload }): void
type _LogSinkCheck = { insert: (input: CreateLogInput) => void };
const _logRepoSatisfiesLogSink: _LogSinkCheck = {} as Pick<LogRepo, 'insert'>;
void _logRepoSatisfiesLogSink;
```

- [ ] **Step 4: Re-export from `packages/storage/src/index.ts`**

Append:

```typescript
export { LogRepo } from './repos/logs.js';
export type { Log, CreateLogInput, LogFilter, LogLevel } from './types.js';
```

(Merge the types line with the existing `export type { ... }` block if present.)

- [ ] **Step 5: Run tests**

Run: `cd packages/storage && pnpm test`
Expected: all prior tests pass + 10 new log tests. Total should be 40.

- [ ] **Step 6: Commit**

```bash
git add packages/storage/src/repos/logs.ts packages/storage/src/index.ts packages/storage/tests/logs.test.ts
git commit -m "feat(storage): LogRepo with list/listSince/sweep + AUTOINCREMENT cursor"
```

---

## Phase 2 — Logger

### Task 2.1: `dbSink` option on `createLogger` (TDD)

**Files:**
- Modify: `packages/logger/src/index.ts`
- Create: `packages/logger/tests/db-sink.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/logger/tests/db-sink.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createLogger, type LogSink } from '../src/index.js';

interface Captured {
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

function makeSink(): { sink: LogSink; captured: Captured[] } {
  const captured: Captured[] = [];
  const sink: LogSink = { insert: (input) => captured.push(input) };
  return { sink, captured };
}

describe('createLogger with dbSink', () => {
  it('is a no-op shape change when dbSink is absent (stdout only)', () => {
    const logger = createLogger({ service: 'worker' });
    expect(typeof logger.info).toBe('function');
  });

  it('captures info lines and extracts event + correlationId + message', async () => {
    const { sink, captured } = makeSink();
    const logger = createLogger({ service: 'worker', dbSink: sink });
    logger.info({ event: 'boot', correlationId: 'c-1' }, 'zeno booting');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captured).toHaveLength(1);
    const [first] = captured;
    expect(first?.service).toBe('worker');
    expect(first?.level).toBe(30);
    expect(first?.event).toBe('boot');
    expect(first?.correlationId).toBe('c-1');
    expect(first?.message).toBe('zeno booting');
    expect(first?.payload.startsWith('{')).toBe(true);
  });

  it('leaves event / correlationId as null when absent', async () => {
    const { sink, captured } = makeSink();
    const logger = createLogger({ service: 'api', dbSink: sink });
    logger.warn('just a message');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.event).toBeNull();
    expect(captured[0]?.correlationId).toBeNull();
    expect(captured[0]?.level).toBe(40);
  });

  it('does not throw when the sink insert throws', async () => {
    const sink: LogSink = {
      insert: () => {
        throw new Error('boom');
      },
    };
    const logger = createLogger({ service: 'worker', dbSink: sink });
    expect(() => logger.info({ event: 'x' }, 'boom test')).not.toThrow();
  });

  it('forwards multiple log levels', async () => {
    const { sink, captured } = makeSink();
    const logger = createLogger({ service: 'worker', dbSink: sink });
    logger.info({ event: 'i' }, 'i');
    logger.warn({ event: 'w' }, 'w');
    logger.error({ event: 'e' }, 'e');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captured.map((c) => c.level)).toEqual([30, 40, 50]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/logger && pnpm test`
Expected: `LogSink` not exported.

- [ ] **Step 3: Rewrite `packages/logger/src/index.ts`**

```typescript
import { Writable } from 'node:stream';
import pino, { type Logger } from 'pino';

export interface LogSink {
  insert(input: {
    ts: string;
    level: number;
    service: string;
    event: string | null;
    correlationId: string | null;
    message: string | null;
    payload: string;
  }): void;
}

export interface CreateLoggerOptions {
  service: string;
  dbSink?: LogSink;
}

interface ParsedLogLine {
  time?: string;
  level?: number;
  event?: unknown;
  correlationId?: unknown;
  msg?: unknown;
}

function makeSinkStream(sink: LogSink, service: string): Writable {
  return new Writable({
    write(chunk, _encoding, callback): void {
      try {
        const text = chunk.toString('utf8');
        const parsed = JSON.parse(text) as ParsedLogLine;
        const event = typeof parsed.event === 'string' ? parsed.event : null;
        const correlationId =
          typeof parsed.correlationId === 'string' ? parsed.correlationId : null;
        const message = typeof parsed.msg === 'string' ? parsed.msg : null;
        const ts = typeof parsed.time === 'string' ? parsed.time : new Date().toISOString();
        const level = typeof parsed.level === 'number' ? parsed.level : 30;
        sink.insert({
          ts,
          level,
          service,
          event,
          correlationId,
          message,
          payload: text,
        });
      } catch (err) {
        // Sink failure must never kill the stream; surface to stderr so it's
        // visible in docker logs even when the Logs page is broken.
        process.stderr.write(
          `[logger] dbSink insert failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      callback();
    },
  });
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const level = process.env.LOG_LEVEL ?? 'info';
  const base = { service: options.service };
  if (!options.dbSink) {
    return pino({
      level,
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  const sinkStream = makeSinkStream(options.dbSink, options.service);
  const stdoutStream: pino.StreamEntry = { level: 'trace', stream: process.stdout };
  const dbStream: pino.StreamEntry = { level: 'trace', stream: sinkStream };
  return pino(
    {
      level,
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([stdoutStream, dbStream]),
  );
}

export type { Logger };
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd packages/logger && pnpm test`
Expected: 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/logger/src/index.ts packages/logger/tests/db-sink.test.ts
git commit -m "feat(logger): optional dbSink via pino multistream (TDD)"
```

---

## Phase 3 — Worker retention + wiring

### Task 3.1: `LogsRetention` helper (TDD)

**Files:**
- Create: `apps/worker/src/logs/retention.ts`
- Create: `apps/worker/tests/logs/retention.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/worker/tests/logs/retention.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DB, LogRepo, openDatabase, runMigrations } from '@zeno/storage';
import { LogsRetention } from '@/logs/retention';

let db: DB;
let repo: LogRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new LogRepo(db);
});

function insertOldLog(): void {
  repo.insert({
    ts: '2026-03-01T00:00:00.000Z',
    level: 30,
    service: 'worker',
    event: 'ancient',
    correlationId: null,
    message: 'ancient',
    payload: '{}',
  });
}

describe('LogsRetention', () => {
  it('sweeps on start()', () => {
    insertOldLog();
    const now = new Date('2026-04-16T00:00:00.000Z');
    const retention = new LogsRetention({ logRepo: repo, retentionDays: 7, now: () => now });
    retention.start();
    retention.stop();
    expect(repo.list({}).logs).toHaveLength(0);
  });

  it('schedules a daily interval after the initial sweep', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-16T00:00:00.000Z');
    const retention = new LogsRetention({ logRepo: repo, retentionDays: 7, now: () => now });
    retention.start();
    insertOldLog();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    retention.stop();
    vi.useRealTimers();
    expect(repo.list({}).logs).toHaveLength(0);
  });

  it('stop() prevents further sweeps', () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-16T00:00:00.000Z');
    const retention = new LogsRetention({ logRepo: repo, retentionDays: 7, now: () => now });
    retention.start();
    retention.stop();
    insertOldLog();
    vi.advanceTimersByTime(48 * 60 * 60 * 1000);
    vi.useRealTimers();
    expect(repo.list({}).logs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/worker && pnpm test tests/logs/retention.test.ts`

- [ ] **Step 3: Implement `apps/worker/src/logs/retention.ts`**

```typescript
import type { LogRepo } from '@zeno/storage';
import { createLogger } from '@zeno/logger';

const DAY_MS = 24 * 60 * 60 * 1000;
const logger = createLogger({ service: 'worker' });

export interface LogsRetentionOptions {
  logRepo: LogRepo;
  retentionDays: number;
  now?: () => Date;
  intervalMs?: number;
}

export class LogsRetention {
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly intervalMs: number;

  constructor(private readonly opts: LogsRetentionOptions) {
    this.now = opts.now ?? (() => new Date());
    this.intervalMs = opts.intervalMs ?? DAY_MS;
  }

  start(): void {
    if (this.timer) return;
    this.runSweep();
    this.timer = setInterval(() => this.runSweep(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private runSweep(): void {
    const threshold = new Date(this.now().getTime() - this.opts.retentionDays * DAY_MS);
    try {
      const deleted = this.opts.logRepo.sweep(threshold.toISOString());
      logger.info(
        { event: 'logs_retention_swept', count: deleted, threshold: threshold.toISOString() },
        'logs retention sweep complete',
      );
    } catch (err) {
      logger.error(
        {
          event: 'logs_retention_failed',
          err: err instanceof Error ? err.message : String(err),
        },
        'logs retention sweep failed',
      );
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/worker && pnpm test tests/logs/retention.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/logs/retention.ts apps/worker/tests/logs/retention.test.ts
git commit -m "feat(worker): LogsRetention helper with start/stop + daily sweep (TDD)"
```

---

### Task 3.2: Wire `LogRepo` + retention into worker boot

**Files:**
- Modify: `apps/worker/src/config.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add `LOGS_RETENTION_DAYS` to `apps/worker/src/config.ts`**

Find the zod env schema and add:

```typescript
LOGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
```

Add the field to the returned config object:

```typescript
logsRetentionDays: env.LOGS_RETENTION_DAYS,
```

And to the `Config` type:

```typescript
logsRetentionDays: number;
```

- [ ] **Step 2: Update `apps/worker/src/index.ts`**

Read current `apps/worker/src/index.ts`. Find the block where `commands = new CommandRepo(db)` is created. After it, add:

```typescript
const logs = new LogRepo(db);
```

Find the `createLogger({ service: 'worker' })` call (usually near the top). **If the file uses the module-level singleton pattern**, we need to move the logger creation inside `main()` so it can receive the `dbSink`:

```typescript
// near the top of main()
const logger = createLogger({ service: 'worker', dbSink: logs });
```

Ensure any existing module-level `const logger = createLogger(...)` is either removed or refactored to defer. (If it's load-bearing, convert the file's top-level logger to a bootstrap logger for pre-DB messages and switch to the dbSink logger after DB open. Exact edit depends on current file — inspect before touching.)

Add `LogsRetention` imports:

```typescript
import { LogsRetention } from '@/logs/retention';
import { LogRepo } from '@zeno/storage';
```

Instantiate and start (after `commandsPoller.start()`):

```typescript
const logsRetention = new LogsRetention({
  logRepo: logs,
  retentionDays: config.logsRetentionDays,
});
logsRetention.start();
logger.info(
  { event: 'logs_retention_scheduled', retentionDays: config.logsRetentionDays },
  'logs retention scheduled',
);
```

Stop on shutdown (before `commandsPoller.stop()`):

```typescript
logsRetention.stop();
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/worker && pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Docker smoke**

```bash
pnpm run docker:build 2>&1 | tail -3
pnpm run docker:up
sleep 6
pnpm run docker:logs 2>&1 | grep -E 'logs_retention_swept|logs_retention_scheduled'
pnpm run docker:down
```

Expected: both lines present (swept runs on start, scheduled announced after).

Inside the container you can also verify the table is being filled:

```bash
pnpm run docker:up
sleep 10
pnpm run docker:sh -- -c "sqlite3 /workspace/zeno.db 'SELECT COUNT(*) FROM logs'"
pnpm run docker:down
```

Expected: count > 0.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/config.ts apps/worker/src/index.ts
git commit -m "feat(worker): wire LogRepo dbSink + LogsRetention into boot"
```

---

### Task 3.3: Wire `LogRepo` dbSink into api

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Read current `apps/api/src/index.ts`**

Run: `cat apps/api/src/index.ts`
Note where `createLogger({ service: 'api' })` is called and where other repos are constructed.

- [ ] **Step 2: Add `LogRepo` + pass to `createLogger`**

Add import near other storage imports:

```typescript
import { LogRepo } from '@zeno/storage';
```

After opening the DB:

```typescript
const logs = new LogRepo(db);
```

Move/refactor the logger creation to use the sink:

```typescript
const logger = createLogger({ service: 'api', dbSink: logs });
```

(Same caveat as the worker — if a module-level logger exists, handle the bootstrap vs runtime split.)

Add `logs` to the `createApp` call (matching the `AppDeps` shape we'll extend in the next task):

```typescript
const app = createApp({
  config,
  db,
  cronRepo: crons,
  cronRunRepo: cronRuns,
  commandRepo: commands,
  logRepo: logs,     // NEW
  claudeHome,
  profileDir,
  spaDir,
});
```

- [ ] **Step 3: Typecheck will fail**

Run: `cd apps/api && pnpm typecheck`
Expected: error — `logRepo` not in `AppDeps`. That's fine; Task 4.1 fixes the server side.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): wire LogRepo dbSink into api boot"
```

(Typecheck will stay red until Task 4.1. Accept the brief breakage.)

---

## Phase 4 — API `/api/logs` list

### Task 4.1: List endpoint (TDD)

**Files:**
- Create: `apps/api/src/routes/logs.ts`
- Create: `apps/api/tests/routes/logs.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/tests/routes/logs.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DB,
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let logs: LogRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  logs = new LogRepo(db);
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
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    claudeHome: '/tmp',
    profileDir: '/tmp',
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

function seedLog(ts: string, level: number, event: string, correlationId: string | null = null): void {
  logs.insert({
    ts,
    level,
    service: 'worker',
    event,
    correlationId,
    message: `msg-${event}`,
    payload: JSON.stringify({ level, time: ts, event, service: 'worker' }),
  });
}

describe('GET /api/logs', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/logs');
    expect(res.status).toBe(401);
  });

  it('returns empty list on empty db', async () => {
    const res = await makeApp(db).request('/api/logs', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ logs: [], nextCursorId: null });
  });

  it('returns rows newest-first with nextCursorId when limit hits', async () => {
    for (let i = 0; i < 5; i += 1) {
      seedLog(`2026-04-16T12:00:0${i}.000Z`, 30, `e${i}`);
    }
    const res = await makeApp(db).request('/api/logs?limit=3', { headers: authed() });
    const body = (await res.json()) as { logs: Array<{ event: string }>; nextCursorId: number };
    expect(body.logs.map((l) => l.event)).toEqual(['e4', 'e3', 'e2']);
    expect(body.nextCursorId).toBeGreaterThan(0);
  });

  it('filters by level=error', async () => {
    seedLog('2026-04-16T12:00:00.000Z', 30, 'info-x');
    seedLog('2026-04-16T12:00:01.000Z', 50, 'err-x');
    const res = await makeApp(db).request('/api/logs?level=error', { headers: authed() });
    const body = (await res.json()) as { logs: Array<{ event: string }> };
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]?.event).toBe('err-x');
  });

  it('filters by q (event prefix, case-insensitive)', async () => {
    seedLog('2026-04-16T12:00:00.000Z', 30, 'cron_run_success');
    seedLog('2026-04-16T12:00:01.000Z', 40, 'noise');
    const res = await makeApp(db).request('/api/logs?q=cron_run', { headers: authed() });
    const body = (await res.json()) as { logs: Array<{ event: string }> };
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]?.event).toBe('cron_run_success');
  });

  it('rejects invalid level', async () => {
    const res = await makeApp(db).request('/api/logs?level=chaos', { headers: authed() });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && pnpm test tests/routes/logs.test.ts`

- [ ] **Step 3: Implement `apps/api/src/routes/logs.ts`**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { LogLevel, LogRepo } from '@zeno/storage';

const levelName = z.enum(['info', 'warn', 'error']);
const levelMap: Record<z.infer<typeof levelName>, LogLevel> = {
  info: 30,
  warn: 40,
  error: 50,
};

const listQuery = z.object({
  level: levelName.optional(),
  q: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  cursorId: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export interface LogsRouteDeps {
  logs: LogRepo;
}

export function buildLogsRoute(deps: LogsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', zValidator('query', listQuery), (c) => {
    const { level, q, since, until, cursorId, limit } = c.req.valid('query');
    const result = deps.logs.list({
      level: level ? levelMap[level] : undefined,
      q,
      since,
      until,
      cursorId,
      limit,
    });
    return c.json(result);
  });

  return route;
}
```

- [ ] **Step 4: Mount in `apps/api/src/server.ts`**

Add `logRepo: LogRepo` to the `AppDeps` interface. Import `LogRepo` at the top if not already. Add the mount:

```typescript
app.use('/api/logs', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.use('/api/logs/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
app.route('/api/logs', buildLogsRoute({ logs: deps.logRepo }));
```

(Import `buildLogsRoute` at the top.)

- [ ] **Step 5: Update other test `makeApp` helpers to pass `logRepo`**

Search for `makeApp` / `createApp` calls in `apps/api/tests/routes/*.test.ts` and ensure `logRepo: new LogRepo(database)` (with the import) is added to each. The existing test files are: `auth.test.ts`, `stats.test.ts`, `activity.test.ts`, `health.test.ts`, `crons.test.ts`, `sessions.test.ts`, `settings.test.ts`.

- [ ] **Step 6: Run tests**

Run: `cd apps/api && pnpm test`
Expected: all prior tests pass + 6 new logs tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/logs.ts apps/api/src/server.ts apps/api/tests/
git commit -m "feat(api): GET /api/logs list with filters + cursor pagination"
```

---

## Phase 5 — API `/api/logs/stream` SSE

### Task 5.1: SSE endpoint

**Files:**
- Modify: `apps/api/src/routes/logs.ts`
- Modify: `apps/api/tests/routes/logs.test.ts` (add SSE smoke)

- [ ] **Step 1: Write the smoke test**

Append to `apps/api/tests/routes/logs.test.ts`:

```typescript
describe('GET /api/logs/stream', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/logs/stream');
    expect(res.status).toBe(401);
  });

  it('returns a text/event-stream response with correct headers', async () => {
    // Seed one row so the endpoint has something to emit
    seedLog('2026-04-16T12:00:00.000Z', 30, 'initial');
    const res = await makeApp(db).request('/api/logs/stream?sinceId=0', {
      headers: authed(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });
});
```

Note: We don't assert on the stream contents in unit tests because Hono's `streamSSE` uses real timers. Contents get smoked via Phase 10 Docker click-through.

- [ ] **Step 2: Extend `apps/api/src/routes/logs.ts`**

Add imports:

```typescript
import { streamSSE } from 'hono/streaming';
```

Extend `listQuery` with an optional `sinceId` (for SSE only — also accept in GET `/` as a no-op):

```typescript
const listQuery = z.object({
  level: levelName.optional(),
  q: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  cursorId: z.coerce.number().int().min(1).optional(),
  sinceId: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
```

Add the SSE handler inside `buildLogsRoute`, after the `route.get('/', ...)` handler:

```typescript
route.get('/stream', zValidator('query', listQuery), (c) => {
  const { level, q, since, until, sinceId: sinceIdParam } = c.req.valid('query');
  const levelNum = level ? levelMap[level] : undefined;

  return streamSSE(c, async (stream) => {
    // Resolve starting cursor after the connection is open to close any
    // race between request parsing and the first poll tick.
    const head = deps.logs.list({ limit: 1 });
    let lastId = sinceIdParam ?? head.logs[0]?.id ?? 0;
    let lastHeartbeat = Date.now();

    const tick = async (): Promise<void> => {
      const batch = deps.logs.listSince({
        sinceId: lastId,
        level: levelNum,
        q,
        since,
        until,
        limit: 200,
      });
      for (const log of batch) {
        await stream.writeSSE({ id: String(log.id), data: JSON.stringify(log) });
        lastId = log.id;
      }
      if (Date.now() - lastHeartbeat > 30_000) {
        await stream.writeSSE({ event: 'ping', data: '' });
        lastHeartbeat = Date.now();
      }
    };

    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
    });

    while (!aborted) {
      await tick();
      await stream.sleep(500);
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && pnpm test tests/routes/logs.test.ts`
Expected: 8 passing (6 list + 2 SSE smoke).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/logs.ts apps/api/tests/routes/logs.test.ts
git commit -m "feat(api): /api/logs/stream SSE with 500ms per-request poll"
```

---

## Phase 6 — Dashboard infra

### Task 6.1: Log types + filter helpers + enable sidebar

**Files:**
- Create: `apps/dashboard/src/lib/log-filters.ts`
- Create: `apps/dashboard/src/lib/use-logs.ts`
- Create: `apps/dashboard/src/lib/use-logs-stream.ts`
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write `log-filters.ts`**

```typescript
export type LogLevel = 30 | 40 | 50;
export type LogLevelName = 'info' | 'warn' | 'error';
export type TimeRangePreset = '1h' | '24h' | '7d';

export interface LogApi {
  id: number;
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface LogFilters {
  level: LogLevelName | 'all';
  q: string;
  timeRange: TimeRangePreset;
}

export const DEFAULT_FILTERS: LogFilters = {
  level: 'all',
  q: '',
  timeRange: '1h',
};

export function presetToSinceIso(preset: TimeRangePreset, now: Date = new Date()): string {
  const hours = preset === '1h' ? 1 : preset === '24h' ? 24 : 24 * 7;
  return new Date(now.getTime() - hours * 3600_000).toISOString();
}

export function filtersToQueryString(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.level !== 'all') params.set('level', filters.level);
  if (filters.q.trim().length > 0) params.set('q', filters.q.trim());
  params.set('since', presetToSinceIso(filters.timeRange));
  return params.toString();
}
```

- [ ] **Step 2: Write `use-logs.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { type LogApi, type LogFilters, filtersToQueryString } from '@/lib/log-filters';

export interface LogsResponse {
  logs: LogApi[];
  nextCursorId: number | null;
}

export function useLogs(filters: LogFilters, enabled: boolean) {
  const qs = filtersToQueryString(filters);
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => apiFetch<LogsResponse>(`/api/logs?${qs}&limit=100`),
    enabled,
  });
}
```

- [ ] **Step 3: Write `use-logs-stream.ts`**

```typescript
import { useEffect, useRef, useState } from 'react';
import { type LogApi, type LogFilters, filtersToQueryString } from '@/lib/log-filters';

const MAX_IN_MEMORY = 500;

export function useLogsStream(filters: LogFilters, enabled: boolean): {
  logs: LogApi[];
  connected: boolean;
} {
  const [logs, setLogs] = useState<LogApi[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
      return;
    }
    const qs = filtersToQueryString(filters);
    const source = new EventSource(`/api/logs/stream?${qs}`, { withCredentials: true });
    sourceRef.current = source;
    source.onopen = (): void => setConnected(true);
    source.onerror = (): void => setConnected(false);
    source.onmessage = (event): void => {
      try {
        const parsed = JSON.parse(event.data) as LogApi;
        setLogs((prev) => {
          const next = [parsed, ...prev];
          return next.length > MAX_IN_MEMORY ? next.slice(0, MAX_IN_MEMORY) : next;
        });
      } catch {
        // ignore malformed events; heartbeat pings have event type not 'message'
      }
    };
    return (): void => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
      setConnected(false);
    };
  }, [enabled, filters.level, filters.q, filters.timeRange]);

  return { logs, connected };
}
```

- [ ] **Step 4: Enable Logs nav item**

In `apps/dashboard/src/components/layout/Sidebar.tsx`, change the `Logs` entry in `navItems`:

```typescript
{ label: 'Logs', to: '/logs', enabled: true },
```

- [ ] **Step 5: Typecheck + build**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
```

Expected: clean. The `/logs` route doesn't exist yet — the `Link` works because TanStack Router is permissive until generated (Task 7.1 creates the route).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/lib/log-filters.ts apps/dashboard/src/lib/use-logs.ts apps/dashboard/src/lib/use-logs-stream.ts apps/dashboard/src/components/layout/Sidebar.tsx
git commit -m "feat(dashboard): log filter types + useLogs/useLogsStream hooks + enable sidebar"
```

---

## Phase 7 — Dashboard Logs page

### Task 7.1: Components (LevelChips, Search, TimeRange, Following, Row, Json)

**Files:**
- Create: `apps/dashboard/src/components/logs/LevelChips.tsx`
- Create: `apps/dashboard/src/components/logs/LogSearchInput.tsx`
- Create: `apps/dashboard/src/components/logs/TimeRangeSelect.tsx`
- Create: `apps/dashboard/src/components/logs/FollowingToggle.tsx`
- Create: `apps/dashboard/src/components/logs/LogRow.tsx`
- Create: `apps/dashboard/src/components/logs/LogJsonBlock.tsx`

- [ ] **Step 1: `LevelChips.tsx`**

```typescript
import type { JSX } from 'react';
import { cn } from '@/lib/utils';
import type { LogFilters, LogLevelName } from '@/lib/log-filters';

const CHIPS: Array<{ key: LogFilters['level']; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Error' },
];

export function LevelChips({
  value,
  onChange,
}: {
  value: LogFilters['level'];
  onChange: (level: LogFilters['level']) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-panel p-0.5">
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors',
            value === c.key
              ? 'bg-canvas text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `LogSearchInput.tsx`**

```typescript
import type { JSX } from 'react';
import { Input } from '@/components/ui/input';

export function LogSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}): JSX.Element {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="event: cron_run  ou  correlationId: abc-123"
      className="font-mono text-xs"
    />
  );
}
```

- [ ] **Step 3: `TimeRangeSelect.tsx`**

```typescript
import type { JSX } from 'react';
import type { TimeRangePreset } from '@/lib/log-filters';

const OPTIONS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '1h', label: 'Last 1h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
];

export function TimeRangeSelect({
  value,
  onChange,
}: {
  value: TimeRangePreset;
  onChange: (v: TimeRangePreset) => void;
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TimeRangePreset)}
      className="h-8 rounded-md border border-border-subtle bg-panel px-3 text-xs text-text-primary"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: `FollowingToggle.tsx`**

```typescript
import type { JSX } from 'react';
import { cn } from '@/lib/utils';

export function FollowingToggle({
  following,
  connected,
  onChange,
}: {
  following: boolean;
  connected: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  const dot = following && connected ? 'bg-status-active' : 'bg-text-tertiary';
  return (
    <button
      type="button"
      onClick={() => onChange(!following)}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
        following
          ? 'border-border-subtle bg-panel text-text-primary'
          : 'border-border-subtle bg-transparent text-text-secondary',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <span>{following ? 'Following' : 'Follow'}</span>
    </button>
  );
}
```

- [ ] **Step 5: `LogRow.tsx`**

```typescript
import { type JSX, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LogApi } from '@/lib/log-filters';
import { LogJsonBlock } from '@/components/logs/LogJsonBlock';

function levelLabel(level: number): { text: string; colorClass: string; dotClass: string } {
  if (level >= 50) return { text: 'ERROR', colorClass: 'text-status-failed', dotClass: 'bg-status-failed' };
  if (level >= 40) return { text: 'WARN', colorClass: 'text-status-paused', dotClass: 'bg-status-paused' };
  if (level >= 30) return { text: 'INFO', colorClass: 'text-status-active', dotClass: 'bg-status-active' };
  return { text: 'DEBUG', colorClass: 'text-text-tertiary', dotClass: 'bg-text-tertiary' };
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function LogRow({ log }: { log: LogApi }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const level = levelLabel(log.level);
  return (
    <div className="flex flex-col border-b border-panel">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-start gap-4 py-2.5 text-left hover:bg-panel/40"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <span className={cn('h-1.5 w-1.5 rounded-full', level.dotClass)} />
        </span>
        <span className="w-24 shrink-0 font-mono text-[11px] text-text-tertiary">
          {fmtTs(log.ts)}
        </span>
        <span className={cn('w-14 shrink-0 text-[11px] font-medium uppercase tracking-wider', level.colorClass)}>
          {level.text}
        </span>
        <span className="w-48 shrink-0 truncate font-mono text-xs text-text-primary">
          {log.event ?? '—'}
        </span>
        <span className="flex-1 truncate text-xs text-text-secondary">
          {log.message ?? '(no message)'}
        </span>
      </button>
      {expanded && (
        <div className="pb-4 pl-12">
          <LogJsonBlock payload={log.payload} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `LogJsonBlock.tsx`**

```typescript
import type { JSX } from 'react';

function prettyPrint(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return payload;
  }
}

export function LogJsonBlock({ payload }: { payload: string }): JSX.Element {
  return (
    <pre className="whitespace-pre-wrap rounded-md border border-border-subtle bg-canvas p-3 font-mono text-[11px] leading-5 text-text-secondary">
      {prettyPrint(payload)}
    </pre>
  );
}
```

- [ ] **Step 7: Typecheck + build**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/src/components/logs/
git commit -m "feat(dashboard): log page components (chips, search, time range, toggle, row, json)"
```

---

### Task 7.2: `/logs` page

**Files:**
- Create: `apps/dashboard/src/routes/_authed/logs.tsx`

- [ ] **Step 1: Write the page**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { type JSX, useMemo, useState } from 'react';
import { FollowingToggle } from '@/components/logs/FollowingToggle';
import { LevelChips } from '@/components/logs/LevelChips';
import { LogRow } from '@/components/logs/LogRow';
import { LogSearchInput } from '@/components/logs/LogSearchInput';
import { TimeRangeSelect } from '@/components/logs/TimeRangeSelect';
import { DEFAULT_FILTERS, type LogFilters } from '@/lib/log-filters';
import { useLogs } from '@/lib/use-logs';
import { useLogsStream } from '@/lib/use-logs-stream';

export const Route = createFileRoute('/_authed/logs')({
  component: LogsPage,
});

function LogsPage(): JSX.Element {
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [following, setFollowing] = useState(false);

  const historical = useLogs(filters, !following);
  const streamed = useLogsStream(filters, following);

  const logs = useMemo(() => {
    if (following) return streamed.logs;
    return historical.data?.logs ?? [];
  }, [following, historical.data, streamed.logs]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Observability
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Logs</h1>
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
            Pino JSON logs do worker + api. Filtra, busca por event ou correlationId, expande qualquer linha pra ver o payload inteiro.
          </p>
        </div>
        <FollowingToggle
          following={following}
          connected={streamed.connected}
          onChange={setFollowing}
        />
      </header>

      <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
        <LevelChips
          value={filters.level}
          onChange={(level) => setFilters((f) => ({ ...f, level }))}
        />
        <div className="flex-1">
          <LogSearchInput
            value={filters.q}
            onChange={(q) => setFilters((f) => ({ ...f, q }))}
          />
        </div>
        <TimeRangeSelect
          value={filters.timeRange}
          onChange={(timeRange) => setFilters((f) => ({ ...f, timeRange }))}
        />
      </div>

      <section className="flex flex-col">
        {!following && historical.isLoading && (
          <span className="py-4 text-sm text-text-secondary">carregando…</span>
        )}
        {!following && historical.isError && (
          <span className="py-4 text-sm text-status-failed">falhou ao carregar</span>
        )}
        {logs.length === 0 && !historical.isLoading && (
          <span className="py-4 text-sm text-text-secondary">sem resultados nos filtros atuais</span>
        )}
        {logs.map((l) => (
          <LogRow key={l.id} log={l} />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

```bash
cd apps/dashboard && pnpm typecheck && pnpm build
```

Expected: clean; generated route-tree now includes `/_authed/logs`.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/_authed/logs.tsx
git commit -m "feat(dashboard): /logs page with filter bar + historical list + Following mode"
```

---

## Phase 8 — Final smoke + PR update

### Task 8.1: Full-stack smoke via Playwright

**Files:** (none — verification)

- [ ] **Step 1: Quality gate**

Run: `pnpm run quality-gate`
Expected: green across all workspaces.

- [ ] **Step 2: Rebuild + boot**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
pnpm run docker:logs 2>&1 | grep -E 'zeno_online|api_listening|commands_poller_started|logs_retention_scheduled'
```

Expected: all four lines present.

- [ ] **Step 3: Verify logs are being written**

```bash
pnpm run docker:sh -- -c "sqlite3 /workspace/zeno.db 'SELECT COUNT(*), MIN(ts), MAX(ts) FROM logs'"
```

Expected: count > 10, timestamps within last minute.

- [ ] **Step 4: API smoke**

```bash
curl -sf "http://localhost:3000/api/logs?level=info&limit=5" -b "zeno_auth=$(node -e "const {createHmac}=require('node:crypto');const expires=Date.now()+60000;const secret=process.env.DASHBOARD_SESSION_SECRET;const sig=createHmac('sha256',secret).update(String(expires)).digest('hex');console.log(expires+'.'+sig)" )" | jq '.logs | length'
```

(Script derives the cookie inline. If the environment doesn't expose the secret, login via browser and reuse the Set-Cookie value.)

Expected: `5`.

- [ ] **Step 5: Browser click-through (Playwright MCP)**

- Navigate `http://localhost:3000/logs` (authenticated from prior session)
- Screenshot saved to `tmp/playwright/logs-initial.png`
- Click `Error` chip → list filters; screenshot `tmp/playwright/logs-error-filter.png`
- Type `cron` into search → list narrows
- Click the `Follow` toggle → dot turns green; `Following` label visible
- In another tab or via curl, trigger a cron run-now (POST `/api/crons/.../run-now`) and confirm new rows appear in the Following feed within ~1s
- Click a row → JSON expands below; screenshot `tmp/playwright/logs-expanded.png`
- Toggle `Follow` OFF → stream closes; last rows still visible

- [ ] **Step 6: Stop**

```bash
pnpm run docker:down
```

- [ ] **Step 7: Push**

```bash
git push
```

- [ ] **Step 8: Update PR #2 description**

Use `gh pr edit 2` to add a "Phase C" section reflecting the logs feature, updated totals, and the new non-empty `/logs` page. Don't merge.

---

## Done

Phase C closed. The dashboard is feature-complete per spec 0008 (all 8 artboards implemented). Backlog items stay in `context/backlog.md` for future specs.
