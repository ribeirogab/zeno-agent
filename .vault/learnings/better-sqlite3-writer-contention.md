---
tags:
  - learning
  - storage
  - sqlite
  - performance
related:
  - "[[db-as-contract-pattern]]"
created: 2026-04-16
---
# better-sqlite3 is sync + single-writer — long transactions block others

better-sqlite3 exposes a synchronous API. Under the hood SQLite allows multiple readers and exactly one writer at a time (with WAL). Every `.run()` / `.exec()` on a prepared statement that writes acquires the writer lock briefly. A `db.transaction(fn)` holds the writer lock for the whole `fn`.

In Zeno, worker and api are **two separate processes** opening the same file. They're serialized at the OS level — when one holds the writer lock, the other blocks on its next write. The blocking is inside Node's `.run()` call; the event loop is stuck.

At realistic log volume (<10 lines/s steady state) this is invisible. The risk surfaces when:
- A long worker transaction (e.g., `CommandRepo.claimPending` wrapped in `db.transaction`, or a batch migration) runs while the api tries to write a log line.
- A tight worker loop emits hundreds of logs/s.

## Context

Raised by the spec 0014 reviewer. The spec's original framing ("raw insert ~1-5µs, not a problem") understated it; contention is the real worst case, not the write cost.

## How to Apply

- **Keep transactions short.** Prefer single-statement atomic operations (`UPDATE ... RETURNING`) over multi-statement `db.transaction(...)` when you can express the operation that way. `CommandRepo.claimPending` is already this shape.
- **Never hold a transaction across an `await`.** better-sqlite3 is sync, so you can't literally `await` inside a transaction, but mixing in async calls between `prepare` and `run` inside a logical "transaction" effectively holds the lock during the I/O. Don't do it.
- **For write bursts**, buffer in memory then flush in one transaction. Example: if a tool ever wants to insert 10k rows, build them into an array and `insertMany = db.transaction((rows) => rows.forEach(insertOne))` — one transaction, not 10k.
- **Measure before optimizing.** The worst-case stall at current scale is a few ms. Don't add a buffer just because this note exists.

## Signal that it became a problem

- `logs` table writes drop visibly during cron runs (count(\*) stagnates for seconds at a time).
- Slack responses stall immediately after a dashboard action.
- `docker:logs` shows pino events clustered then sparse then clustered.

If any of those happen, the mitigation path is a batched write layer inside `@zeno/logger` (options: `flushEvery?: number`, `bufferSize?: number`). Not currently built.
