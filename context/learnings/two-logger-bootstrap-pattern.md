---
tags:
  - learning
  - logger
  - architecture
related:
  - "[[logger-factory-dbsink-propagation]]"
  - "[[../specs/0014-dashboard-logs/spec|spec 0014]]"
created: 2026-04-16
---
# Use a boot logger + main logger when the DB is a dependency of logging

`@zeno/logger`'s `dbSink` requires a `LogRepo`, which requires a DB connection. The DB is opened inside `main()` after env validation + health checks. But env validation itself might want to log, health checks definitely want to log, etc. There's a chicken-and-egg: the logger with dbSink can't exist until the DB is open, but we want to log during and before DB open.

Solution: create two logger instances inside `main()`.

```typescript
async function main(): Promise<void> {
  const config = loadApiConfig();

  // Pre-DB logger — stdout only. Covers env validation, healthchecks, boot errors.
  const bootLogger = createLogger({ service: 'api' });
  bootLogger.info({ event: 'api_boot_start' }, 'api booting');

  // Open DB + repos
  const db = openDatabase(...);
  runMigrations(db);
  const logs = new LogRepo(db);

  // Main logger — now with dbSink. Pass this one to all downstream modules.
  const logger = createLogger({ service: 'api', dbSink: logs });

  // Everything from here on uses `logger`.
  const app = createApp({ ..., logRepo: logs, logger });
  // ...
}
```

## Context

Arose naturally when wiring spec 0014. Both `apps/worker/src/index.ts` and `apps/api/src/index.ts` adopted this pattern.

## How to Apply

- **Never declare a module-level logger at the top of `apps/*/src/index.ts`** if that app uses a dbSink. Both loggers are `main()`-local.
- **Downstream modules** (helpers, routes, classes) accept the logger via options — see `[[logger-factory-dbsink-propagation]]`.
- **Bootstrap errors** (e.g., `loadConfig` throws) can't log to the DB because there's no DB yet. That's fine — `bootLogger` goes to stdout and surfaces via `docker logs`.
- **What you lose by this pattern**: the bootstrap phase doesn't appear on the `/logs` page. Everything from DB-open onward does. The "first ~200ms after container start" gap is acceptable; the events worth watching (`zeno_online`, `api_listening`, `commands_poller_started`, etc) all fire after the main logger is active.

## Anti-pattern to avoid

A single module-level logger that retrofits the dbSink via a mutable reference (`logger.setSink(...)`). Pino's stream config is captured at construction; swapping streams post-construction is fragile. Two instances — one without, one with — is cleaner.
