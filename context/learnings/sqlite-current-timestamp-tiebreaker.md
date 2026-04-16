---
tags:
  - learning
  - storage
  - sqlite
related:
  - "[[0013-dashboard-crud]]"
created: 2026-04-16
---
# SQLite `CURRENT_TIMESTAMP` needs a rowid tie-breaker

SQLite's default `CURRENT_TIMESTAMP` function returns text at second precision (`YYYY-MM-DD HH:MM:SS`). Two rows inserted within the same second share an identical timestamp, so any query that relies solely on `ORDER BY created_at` (or `started_at`, etc.) to return rows in insertion order becomes non-deterministic. Breaking ties with `rowid` restores insertion order cheaply — SQLite's implicit rowid is a monotonic integer assigned at insert time, and is already an index.

## Context

While implementing `CommandRepo.recent()` and `CommandRepo.claimPending()` for spec 0013, a test that enqueued two commands back-to-back and expected the second to appear first in `recent()` was flaky: the rows had identical `created_at` values, so the ordering between them was not guaranteed by `ORDER BY created_at DESC` alone. The same concern applies to `claimPending`, which needs FIFO semantics across rapid enqueues.

## How to Apply

For any SQLite table using `CURRENT_TIMESTAMP` as the insertion marker, append `rowid` as the tie-breaker on ordered queries that must reflect insertion order:

```sql
SELECT * FROM commands ORDER BY created_at DESC, rowid DESC;
SELECT id FROM commands WHERE status = 'pending' ORDER BY created_at, rowid;
```

Alternatives — higher-precision timestamps via `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` — work too, but they require schema changes and still collide at sub-millisecond rates. The rowid tie-breaker is free, idiomatic in SQLite, and bulletproof.
