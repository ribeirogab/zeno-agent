---
tags:
  - learning
  - typescript
  - architecture
related:
  - "[[../specs/0014-dashboard-logs/spec|spec 0014]]"
created: 2026-04-16
---
# Structural interface to avoid cross-package runtime deps

When package A wants to receive an object whose shape lives in package B, the obvious path is to `import type { Shape } from 'packageB'`. That works but **adds a runtime dependency edge from A to B** even if only types are imported — for the type-only import to resolve you need `packageB` installed, and downstream tooling (turbo graph, dep audits, publish scripts) treats A as depending on B.

In a monorepo where `@zeno/logger` would be importing `@zeno/storage`, just to reference `LogRepo`, this creates a cycle risk: if `@zeno/storage` ever wants to log via `@zeno/logger`, you have an import loop.

**Solution:** package A declares its own minimal interface describing the shape it needs. Package B's concrete type satisfies it **structurally** (TypeScript structural typing) without any import between A and B. The consumer app (`apps/worker`, `apps/api`) is where both types are in scope, and it passes a B-value where A expects its own interface.

## Context

Applied in spec 0014: `@zeno/logger` defines `LogSink { insert(input: {...}): void }` inside its own `src/index.ts`. `@zeno/storage` defines `LogRepo` with an `insert(input: CreateLogInput): void` method. `LogRepo` satisfies `LogSink` by shape only. The worker's `index.ts` does `createLogger({ service: 'worker', dbSink: logRepo })` — that's where both types get reconciled.

## How to Apply

1. In the consumer package, declare the minimum interface you need:
   ```typescript
   // @zeno/logger
   export interface LogSink {
     insert(input: { ts: string; level: number; /* ... */ }): void;
   }
   ```
2. In the producer package (separately), write the class normally:
   ```typescript
   // @zeno/storage
   export class LogRepo {
     insert(input: CreateLogInput): void { /* ... */ }
   }
   ```
3. Don't import either from the other. Let the consuming app wire them:
   ```typescript
   // apps/worker/src/index.ts
   import { createLogger } from '@zeno/logger';
   import { LogRepo } from '@zeno/storage';
   const logs = new LogRepo(db);
   const logger = createLogger({ service: 'worker', dbSink: logs });
   ```

## Drift protection

The risk is that `LogSink.insert` and `LogRepo.insert` signatures drift — a new field added to `CreateLogInput` not mirrored in `LogSink` breaks the structural satisfaction only at the call site, not at either package boundary. Add a compile-time assertion in the producer package (where both types are visible via the test setup or a dedicated file):

```typescript
// packages/storage/src/repos/logs.ts — at the bottom
type _LogSinkCheck = { insert: (input: CreateLogInput) => void };
const _logRepoSatisfiesLogSink: _LogSinkCheck = {} as Pick<LogRepo, 'insert'>;
void _logRepoSatisfiesLogSink;
```

If a field gets added to `CreateLogInput` that isn't in `LogSink`, this line breaks the build in `@zeno/storage` — exactly where the ownership of the shape lives.

## When to use vs. when not to

- **Use** when the interface is small (≤10 fields, ≤3 methods), stable, and the import direction would create a cycle risk or an unwanted dep edge.
- **Don't use** for large shared types (DTOs with 30 fields). Duplication rot is worse than the dep edge. Put those in a shared package.
