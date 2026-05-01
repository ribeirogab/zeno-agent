---
tags:
  - learning
  - storage
  - sqlite
related:
  - "[[sqlite-current-timestamp-tiebreaker]]"
  - "[[../specs/2026-04-16-dashboard-logs/spec-dashboard-logs|spec 0014]]"
created: 2026-04-16
---
# Use `INTEGER PRIMARY KEY AUTOINCREMENT` when a cursor must survive DELETEs

SQLite's default `INTEGER PRIMARY KEY` is an alias for `ROWID`, which **can be reused** after a row is deleted. Specifically: if the max rowid is `N`, deleting row `N` and inserting a new one may reassign `N`. Adding `AUTOINCREMENT` changes the semantics: ids are strictly monotonic and never reused, backed by a separate `sqlite_sequence` table row.

## Context

Spec 0014's SSE endpoint maintains a cursor: "give me rows with `id > lastSent`". For this to work after the daily retention sweep (`DELETE FROM logs WHERE ts < ...`), the `id` column must never reuse a value. Otherwise a new row could get an id that a subscriber already saw, silently losing it.

The `logs` table uses `AUTOINCREMENT` for this reason. The `commands` table does NOT — it's cleaned via "finished" status transitions, never by DELETE, so rowid reuse wouldn't bite it, but even there the `id` is a UUID string so the question is moot.

## How to Apply

**Use `AUTOINCREMENT`** on any integer PK whose value is used as a client-visible cursor or event id, especially when the table is subject to DELETE for retention/cleanup.

Pattern:

```sql
CREATE TABLE events (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  ...
);
```

**Don't use `AUTOINCREMENT`** when:
- The PK is a UUID / string (not applicable).
- Rows are soft-deleted (status column flip, no DELETE). No reuse risk to begin with.
- Write volume is extreme enough that the `sqlite_sequence` contention becomes measurable (it won't at Zeno scale).

## Cost

Per-insert: one extra row update in `sqlite_sequence` (a tiny table, usually cached). Measured impact in better-sqlite3: sub-microsecond. Not a concern.

## Anti-pattern to avoid

Mixing an `id` column (rowid alias) with a separate "monotonic sequence" maintained by the application. Two sources of truth that drift. Let SQLite own the monotonicity.
