---
tags:
  - learning
  - react
  - tanstack-query
related:
  - "[[../specs/0019-dashboard-optimistic-updates/spec]]"
  - "[[fire-and-forget-mutation-ux]]"
  - "[[db-as-contract-pattern]]"
created: 2026-04-17
---
# Optimistic-mutation primitive over TanStack `useMutation`

Dashboard mutations in Zeno use a declarative wrapper (`useOptimisticMutation`) over TanStack Query's raw `useMutation`. The wrapper takes `mutationFn`, an optional `optimisticUpdate` returning a list of `{ queryKey, updater }` cache writes, and `invalidateKeys`; it handles query cancellation, snapshot-and-restore on error, the optimistic write, and success/error toasts. Each mutation becomes ~10 lines of config instead of ~35 lines of `onMutate` / `onError` / `onSettled` plumbing.

## Context

Spec 0019 shipped with five cron mutations (pause, resume, delete, create, run-now). Without the primitive, each repeated the same snapshot + cancel + mutate + restore + invalidate pattern. The first draft extracted that ceremony into inline `onMutate`/`onError` blocks per mutation. The second draft extracted the pattern into a single hook and saw each mutation collapse to a declarative config.

The primitive also solves the contravariance problem at the type boundary: `OptimisticCacheChange` internally stores `updater: (prev: unknown) => unknown`, but the `cacheChange<T>(queryKey, updater)` factory lets callers write typed updaters. The cast lives inside the factory, not at every call site.

## How to Apply

For any new dashboard mutation that affects a query cache:

```typescript
export function useFoo() {
  return useOptimisticMutation<Vars, Result>({
    mutationFn: (vars) => apiFetch(...),
    optimisticUpdate: (vars) => [
      cacheChange<ListShape>(['key'], (prev) => /* next state */),
    ],
    invalidateKeys: (vars) => [['key']],
    successToast: 'ok',
  });
}
```

For inserts that need a provisional row (create, run-now, etc.), use `tempId('prefix')` to generate an ID the renderer can detect via `isTempId()` and dim via `opacity-60 pointer-events-none`. The 1.5s invalidate replaces the temp row with the server row.

Mutations with no cache effect (like `useRestartWorker`) stay as plain `useMutation`. Comment the decision so future maintainers don't "fix" it.
