---
tags:
  - learning
  - logger
  - gotcha
related:
  - "[[../specs/2026-04-16-dashboard-logs/spec-dashboard-logs|spec 0014]]"
created: 2026-04-16
---
# Module-level loggers skip the dbSink. Pass the logger through.

`@zeno/logger`'s `createLogger({service, dbSink?})` attaches a second pino stream that writes to the `logs` table. The stream is per-logger-instance. A module-level `const logger = createLogger({service: 'worker'})` at the top of `poller.ts`, `retention.ts`, etc. creates a **separate** logger instance without any dbSink — so those modules' log lines hit stdout only and are invisible on the `/logs` page.

The fix is mechanical: every module that needs logging with the dbSink accepts a `logger?: Logger` option in its constructor/options object, uses `opts.logger ?? fallbackLogger`, and the bootstrap (`apps/worker/src/index.ts`) passes the main dbSink-enabled logger into each.

## Context

Discovered during the Phase C Playwright smoke. Created a cron via the `/crons/new` modal; the mutation went through (worker logs showed `command_processed` on stdout) but `/logs` page was empty after boot events. Root cause: `CommandsPoller` and `LogsRetention` each had a module-level `createLogger` without sink. Fixed in commit `7bfdb20` by adding `logger?: Logger` to both.

## How to Apply

- **Every new worker subsystem with logging** (cron runner, profile watcher, Slack adapter, future agents) should accept `logger` via options and fall back to a module-scope `createLogger({service: 'worker'})` only for cases where the bootstrap hasn't run yet.
- **Pattern:**
  ```typescript
  import { createLogger, type Logger } from '@zeno/logger';

  const fallbackLogger = createLogger({ service: 'worker' });

  interface Options {
    logger?: Logger;  // bootstrap passes the dbSink-enabled one
    // ...
  }

  class Thing {
    private readonly logger: Logger;
    constructor(opts: Options) {
      this.logger = opts.logger ?? fallbackLogger;
    }
  }
  ```
- **When adding a new log event in an existing module**, check whether the module is receiving the logger via options (most new modules do) or holding its own (older ones). If the latter, wire it up — it's a ~5 line change and it's mandatory for observability of anything debuggable on the Logs page.

## Audit command

```bash
grep -rn "createLogger\b" apps/worker/src packages/logger/src | grep -v "index.ts"
```

Any match outside `index.ts` that isn't declared as `fallbackLogger` (a deliberate fallback) is a candidate for audit.
