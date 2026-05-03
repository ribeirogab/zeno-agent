---
status: shipped
feature: database-foundation
created: 2026-04-16
shipped: 2026-04-16
---
# Database Foundation — Spec

**Status:** Draft
**Scope:** SQLite-based persistence layer for Zeno. Provides DB connection, migration runner, base schema (sessions + crons + cron_runs), and repository modules. No user-facing feature — this is infrastructure consumed by specs 0006 (session persistence) and 0007 (crons).

## Context

Spec 0003 (thread sessions) keeps `Map<threadId, sessionId>` in memory; restart wipes it. Spec 0007 (crons) needs to persist user-created scheduled tasks. Both need a real database. SQLite is the right choice: zero ops, file-based, fast for our scale (single user, low write rate).

## Problem Statement

Need a place to durably store agent state (thread → session mappings) and user data (crons + their run history) that survives container restart. Adding a relational store with a sane abstraction now means specs 0006 and 0007 land cleanly.

## Non-Goals

1. **ORM.** Drizzle/Prisma overkill for this scale. Hand-rolled prepared statements via better-sqlite3.
2. **Connection pooling.** SQLite is single-writer; one process, one connection.
3. **Schema migrations across versions.** Forward-only migrations applied in order. No rollback.
4. **Backup/restore tooling.** Out of scope; the DB lives on a Docker volume.
5. **Multi-tenant isolation.** Single-user scope.
6. **Read replicas / sharding.** Not happening at this scale.

## Constraints

- **better-sqlite3** as the driver (synchronous, prebuilt binaries for linux/arm64 + linux/x64, no native build needed in Docker).
- **`/workspace/zeno.db`** as the file location — `/workspace` is already a Docker volume that survives restart.
- **WAL mode** enabled for crash-resistance (avoid DB corruption on container kill).
- **Migrations applied at boot** by the storage module. Failure to apply migrations is a fatal boot error.
- **In-memory mode** (`:memory:`) used in tests.

## Design

### Schema (initial migration)

```sql
-- migrations table tracks what's been applied
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- sessions: thread_id (Slack) → session_id (Claude Agent SDK)
CREATE TABLE IF NOT EXISTS sessions (
  thread_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- crons: scheduled tasks (static + dynamic)
CREATE TABLE IF NOT EXISTS crons (
  id TEXT PRIMARY KEY,                   -- uuid
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,                  -- the prompt to send to the agent
  schedule TEXT NOT NULL,                -- cron expression
  enabled INTEGER NOT NULL DEFAULT 1,    -- 0 | 1
  source TEXT NOT NULL,                  -- 'static' | 'chat'
  created_by TEXT,                       -- slack user id
  notify_conversation_id TEXT,           -- where to post results (channel/DM id)
  notify_thread_id TEXT,                 -- thread to reply to (null = standalone)
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_run_at TEXT,
  next_run_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_crons_enabled_next_run ON crons(enabled, next_run_at);

-- cron_runs: history of cron executions (auditing + dashboard)
CREATE TABLE IF NOT EXISTS cron_runs (
  id TEXT PRIMARY KEY,
  cron_id TEXT NOT NULL REFERENCES crons(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT NOT NULL,                  -- 'running' | 'success' | 'failed' | 'skipped'
  output TEXT,                           -- truncated agent response
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_cron ON cron_runs(cron_id, started_at DESC);
```

### Module layout

```
src/storage/
├── db.ts                # Database singleton + open/close + WAL + pragmas
├── migrations.ts        # Migration runner (reads migrations/*.sql in order)
├── migrations/
│   └── 001_init.sql
├── repos/
│   ├── sessions.ts      # SessionRepo
│   ├── crons.ts         # CronRepo
│   └── cron-runs.ts     # CronRunRepo
└── types.ts             # Session, Cron, CronRun TypeScript types
```

### API sketches

```typescript
// src/storage/db.ts
export function openDatabase(path: string): Database;
export function closeDatabase(db: Database): void;

// src/storage/migrations.ts
export function runMigrations(db: Database): { applied: number[]; current: number };

// src/storage/repos/sessions.ts
export class SessionRepo {
  constructor(db: Database);
  upsert(threadId: string, sessionId: string): void;
  get(threadId: string): string | null;
  delete(threadId: string): void;
  touch(threadId: string): void;
  list(): Session[];
}

// src/storage/repos/crons.ts
export class CronRepo {
  constructor(db: Database);
  create(input: CreateCronInput): Cron;
  update(id: string, patch: Partial<Cron>): Cron;
  get(id: string): Cron | null;
  list(filter?: { enabled?: boolean; source?: 'static' | 'chat' }): Cron[];
  delete(id: string): void;
  due(now: Date): Cron[];                // enabled && next_run_at <= now
  markRun(id: string, lastRun: Date, nextRun: Date | null): void;
}

// src/storage/repos/cron-runs.ts
export class CronRunRepo {
  constructor(db: Database);
  start(cronId: string): CronRun;
  finish(id: string, status: 'success' | 'failed' | 'skipped', output?: string, error?: string): void;
  recent(cronId: string, limit?: number): CronRun[];
}
```

### Boot sequence

1. `index.ts` calls `openDatabase('/workspace/zeno.db')` (or `:memory:` in tests).
2. `runMigrations(db)` applies any pending migrations.
3. Repositories instantiate with the `db` handle.
4. Repos passed to consumers (`AgentCore`, future cron runner, future dashboard).

### Files changed

| File | Change |
|---|---|
| `src/storage/db.ts` | New — open/close + WAL + pragmas |
| `src/storage/migrations.ts` | New — migration runner |
| `src/storage/migrations/001_init.sql` | New — initial schema |
| `src/storage/types.ts` | New — Session, Cron, CronRun types |
| `src/storage/repos/sessions.ts` | New — SessionRepo |
| `src/storage/repos/crons.ts` | New — CronRepo |
| `src/storage/repos/cron-runs.ts` | New — CronRunRepo |
| `src/index.ts` | Open DB at boot, run migrations |
| `package.json` | Add `better-sqlite3` + `@types/better-sqlite3` deps |
| `tests/storage/*.test.ts` | New — repo tests using `:memory:` |
| `infra/Dockerfile` | Ensure better-sqlite3 prebuild is fetched (no rebuild) |

## Success Criteria

1. `pnpm install` succeeds; better-sqlite3 prebuild downloads (no native build).
2. Container boots: `db_opened` log + `migrations_applied` log + `zeno_online`.
3. `/workspace/zeno.db` exists on host filesystem after first boot, survives `docker:down` + `docker:up`.
4. WAL mode active (verify via `PRAGMA journal_mode`).
5. Repos pass unit tests against `:memory:` DB (CRUD + filters).
6. Quality gate passes (biome + typecheck + knip + vitest).

## Risks

| Risk | Mitigation |
|---|---|
| better-sqlite3 prebuild missing for some platform → native build fails in Docker | node:24-slim has glibc; better-sqlite3 ships linux-x64 + linux-arm64 prebuilds. If it ever falls through, install build-essential in Dockerfile. |
| DB file corruption on container kill | WAL mode + `synchronous=NORMAL` are good defaults for crash safety. SQLite is robust here. |
| pnpm refuses to run install scripts | better-sqlite3 ships prebuilds, no postinstall needed. If pnpm complains, run `pnpm approve-builds` (documented in README). |
| Concurrent access from multiple processes | Out of scope (single Zeno process). If dashboard becomes a separate process later, use shared open with WAL — already enabled. |

## Open Questions

None. Standard SQLite + repo pattern; nothing surprising here.
