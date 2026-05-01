---
status: shipped
feature: dashboard-optimistic-updates
created: 2026-04-17
shipped: 2026-04-17
---
# Dashboard Optimistic Updates — Spec

**Status:** Shipped
**Scope:** Introduce a reusable `useOptimisticMutation` primitive in `apps/dashboard/src/lib/` that declaratively handles cache snapshot + optimistic write + rollback + invalidate + toasts for every cacheable mutation in the dashboard. Migrate the five mutations that have a visible cache effect (`pause`, `resume`, `delete`, `create`, `run-now`) to the new primitive. The primitive becomes the project pattern — any future mutation added to `mutations.ts` adopts it by default.

## Context

Zeno's dashboard uses a fire-and-forget mutation pattern (see `[[learnings/fire-and-forget-mutation-ux]]`): click → API 204 → `invalidateSoon` schedules a refetch 1.5s later so the worker has time to process the command from the DB-backed command queue. This keeps the client dumb and respects the "DB is the contract" architecture (see `[[learnings/db-as-contract-pattern]]`).

The cost is perceptual: every mutation has a visible 1.5s lag where the UI shows stale state. On a single-operator dashboard that lag is the most noticeable friction — click Pause, watch the pill show "active" for a full second, then flip. Looks broken.

Specs 0015–0018 delivered the visual foundation. Spec 0018 made loading/empty/error states feel intentional via Skeleton/EmptyState/ErrorState. This spec finishes the feel-fast work at the interaction layer.

The intent is not just to fix three mutations — it's to establish **the optimistic pattern** as the default way to write mutations in this codebase. New actions added in future specs should have no extra cost to make optimistic.

## Problem Statement

Every mutation in the dashboard currently shows stale UI for ~1.5s between click and cache refetch. The client knows what the next state should be at click time (pausing → `enabled: false`, creating → a new row, etc.). Making each mutation optimistic individually works but adds ~15 lines of ceremony per mutation (cancel queries, snapshot, write, rollback, restore, invalidate). Without a shared primitive, the pattern decays — some mutations get it, others don't, error handling drifts, cache shape bugs proliferate.

A single `useOptimisticMutation` primitive wraps TanStack Query's `useMutation`, takes the mutation function plus a declarative description of cache changes, and handles the rest. Each mutation becomes ~8 lines of config instead of ~35 lines of plumbing.

## Non-Goals

1. **Optimistic update for `restart worker`.** No cache effect — the health query status is server-driven. Out of scope.
2. **React 19 `useOptimistic` hook.** TanStack Query's mutation-level pattern owns query caches; `useOptimistic` would require separate state. One source of truth (Query) is simpler.
3. **Undo toasts.** Separate UX design. Still out of scope (spec 0018 Non-Goal #2 carried forward).
4. **Bulk mutations** (select multiple crons, pause all). No UI exists for this; the primitive will support it when a caller passes an array as `variables`, but no call site in this spec.
5. **Server-sent retries / automatic retries on network error.** Rollback is deterministic; retries are user-initiated via the error toast.
6. **Changing the command-queue architecture or `invalidateSoon` delay.** The 1.5s stays. The fire-and-forget model stays. This spec operates strictly above the API layer.
7. **Paper frames.** No rendered component changes. Spec 0017 governance rule doesn't apply.

## Constraints

- **No new runtime deps.** TanStack Query already exposes `onMutate` / `onError` / `onSuccess` / `onSettled` and the full `QueryClient` cache API.
- **Strict types end-to-end.** No `any`, no `// biome-ignore`, no `as unknown as T`. The primitive's generics carry types from `variables → optimistic update → mutation result`.
- **Cache shapes match existing queries.** `CronApi` from `use-crons.ts`, `CronDetailApi` from `use-cron.ts`. Any drift is a TypeScript error, not a runtime bug.
- **Query cancellation is mandatory.** Before writing optimistic state, `cancelQueries` for every touched key to prevent an in-flight refetch from overwriting.
- **Error path restores the exact snapshot.** If a mutation touches 3 caches, all 3 are snapshotted and all 3 are restored.
- **Invalidate fires from `onSettled`, not `onMutate`.** Timer starts post-API-response so the worker has time to process the command.
- **Toasts stay semantically "command accepted".** The cache update is already visible before the toast — the toast confirms the API acknowledged the command. Copy unchanged from current behavior (PT-BR lowercased).
- **The primitive is the project pattern.** Every future cache-affecting mutation in `apps/dashboard/**` should use it. Document in `context/conventions/code-style.md`.

## Design

### The primitive — `useOptimisticMutation`

```typescript
// apps/dashboard/src/lib/use-optimistic-mutation.ts
import {
  type QueryClient,
  type QueryKey,
  useMutation,
  type UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatError } from '@/lib/format-error';
import { invalidateSoon } from '@/lib/invalidate-soon';

export interface OptimisticCacheChange<TData = unknown> {
  queryKey: QueryKey;
  updater: (prev: TData | undefined) => TData | undefined;
}

export interface OptimisticMutationOptions<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** Declarative cache writes to apply on click. Return `[]` to skip optimism. */
  optimisticUpdate?: (vars: TVars, queryClient: QueryClient) => OptimisticCacheChange[];
  /** Query keys to invalidate after the API responds. Fires via `invalidateSoon`. */
  invalidateKeys?: (vars: TVars, result: TResult | undefined) => QueryKey[];
  /** Delay for `invalidateSoon`. Default 1500ms. */
  invalidateDelayMs?: number;
  /** Toast on 2xx. Static string or function of result+vars. Omit for silent success. */
  successToast?: string | ((result: TResult, vars: TVars) => string);
  /** Toast on error. Defaults to `formatError(err)`. */
  errorToast?: string | ((err: unknown, vars: TVars) => string);
}

interface MutationContext {
  snapshots: Array<{ queryKey: QueryKey; value: unknown }>;
}

export function useOptimisticMutation<TVars, TResult = void>(
  opts: OptimisticMutationOptions<TVars, TResult>,
): UseMutationResult<TResult, unknown, TVars, MutationContext> {
  const qc = useQueryClient();

  return useMutation<TResult, unknown, TVars, MutationContext>({
    mutationFn: opts.mutationFn,

    onMutate: async (vars) => {
      const changes = opts.optimisticUpdate?.(vars, qc) ?? [];
      const snapshots: MutationContext['snapshots'] = [];

      for (const change of changes) {
        await qc.cancelQueries({ queryKey: change.queryKey });
        snapshots.push({ queryKey: change.queryKey, value: qc.getQueryData(change.queryKey) });
        qc.setQueryData(change.queryKey, change.updater(qc.getQueryData(change.queryKey)));
      }

      return { snapshots };
    },

    onError: (err, vars, ctx) => {
      if (ctx) {
        for (const snap of ctx.snapshots) {
          qc.setQueryData(snap.queryKey, snap.value);
        }
      }
      const msg =
        typeof opts.errorToast === 'function'
          ? opts.errorToast(err, vars)
          : (opts.errorToast ?? formatError(err));
      toast.error(msg);
    },

    onSuccess: (result, vars) => {
      if (opts.successToast !== undefined) {
        const msg =
          typeof opts.successToast === 'function' ? opts.successToast(result, vars) : opts.successToast;
        toast.success(msg);
      }
    },

    onSettled: (result, _err, vars) => {
      const keys = opts.invalidateKeys?.(vars, result) ?? [];
      if (keys.length > 0) {
        invalidateSoon(qc, keys, opts.invalidateDelayMs);
      }
    },
  });
}
```

The `formatError` helper is extracted from `mutations.ts` into `apps/dashboard/src/lib/format-error.ts` so the primitive doesn't re-implement it.

### Each mutation becomes declarative

```typescript
// apps/dashboard/src/lib/mutations.ts
export function usePauseCron() {
  return useOptimisticMutation<string, void>({
    mutationFn: (id) => apiFetch(`/api/crons/${id}/pause`, { method: 'POST' }),
    optimisticUpdate: (id) => [
      {
        queryKey: ['crons'],
        updater: (prev: CronApi[] | undefined) =>
          prev?.map((c) => (c.id === id ? { ...c, enabled: false } : c)),
      },
      {
        queryKey: ['crons', id],
        updater: (prev: CronDetailApi | undefined) =>
          prev ? { ...prev, cron: { ...prev.cron, enabled: false } } : prev,
      },
    ],
    invalidateKeys: (id) => [['crons'], ['crons', id]],
    successToast: 'cron pausado',
  });
}
```

Compared to the 30+ lines of today's `usePauseCron`, this is ~12 lines of intent. The primitive hides snapshot + cancel + rollback + invalidate + toast plumbing.

### Migration matrix

| Mutation | Optimistic effect | Cache keys touched | Invalidate keys |
|---|---|---|---|
| `usePauseCron(id)` | `enabled: false` on cron in list + detail | `['crons']`, `['crons', id]` | `['crons']`, `['crons', id]` |
| `useResumeCron(id)` | `enabled: true` on cron in list + detail | `['crons']`, `['crons', id]` | `['crons']`, `['crons', id]` |
| `useDeleteCron(id)` | Remove cron from list | `['crons']` | `['crons']` |
| `useCreateCron(input)` | Prepend temp cron to list (`id: 'tmp_<timestamp>'`, server fills real id on refetch) | `['crons']` | `['crons']` |
| `useRunNowCron(id)` | Prepend provisional `{ status: 'running' }` run to `recentRuns` on detail | `['crons', id]` | `['crons', id]` |
| `useRestartWorker()` | — (no cache effect) | — | — |

`useRestartWorker` stays as-is (plain `useMutation` with toast).

### Temp-id pattern for inserts (`create`, `run-now`)

Inserts need a placeholder row before the server assigns real IDs. Helper:

```typescript
// apps/dashboard/src/lib/temp-id.ts
let counter = 0;
export function tempId(prefix: string): string {
  counter += 1;
  return `${prefix}_tmp_${Date.now()}_${counter}`;
}
```

String-prefixed so `CronRow` / `CronRunHistoryRow` can detect temp rows and dim them (`opacity-60`) or show a subtle "pending" affordance. The invalidate replaces the temp with the server row within 1.5s. Optional visual polish — implement if it doesn't bloat the feature row components.

### Files touched

**NEW:**

| File | Responsibility |
|---|---|
| `apps/dashboard/src/lib/use-optimistic-mutation.ts` | The primitive. |
| `apps/dashboard/src/lib/format-error.ts` | Extracted error formatter (was inline in `mutations.ts`). |
| `apps/dashboard/src/lib/temp-id.ts` | Helper for provisional row IDs. |
| `apps/dashboard/tests/lib/use-optimistic-mutation.test.ts` | Unit tests: happy path (optimistic → success → invalidate), rollback path (optimistic → error → restore), multi-cache snapshot, cancel-in-flight, no `optimisticUpdate` degrades to plain mutation. |

**EDIT:**

| File | Change |
|---|---|
| `apps/dashboard/src/lib/mutations.ts` | Five mutations rewritten atop `useOptimisticMutation`. `useRestartWorker` untouched. `formatError` removed (moved). |
| `apps/dashboard/src/components/crons/cron-row.tsx` | If implementing temp-row polish: detect `id.startsWith('tmp_')` and apply `opacity-60 pointer-events-none`. |
| `apps/dashboard/src/components/crons/cron-run-history-row.tsx` | Same: temp-row polish. |
| `context/conventions/code-style.md` | Short section: "use `useOptimisticMutation` for all dashboard mutations with a cache effect". |
| `context/_index/conventions.md` | Link to the new convention section. |

No Paper frames. No new rendered components.

## User Stories / Scenarios

1. **Pause a cron.** Row pill flips from `active` → `paused` in one frame. Toast "cron pausado" appears ~80ms later. Within 1.5s a silent refetch validates the server agrees. Total perceived latency: zero.

2. **Delete a cron from the detail page.** AlertDialog confirms, row vanishes from the list cache instantly, route transitions to `/crons`. User sees the list already missing the row. If the API fails, the row reappears and a toast "erro N" shows.

3. **Create a cron from `/crons/new`.** Submit button clicked; form navigates to `/crons`; the new row is already visible at the top of the list with `opacity-60` ("pending"). 1.5s later the invalidate replaces it with the server row (with real `id`, `createdAt`, `nextRunAt`). Transition is seamless because cache shape matches.

4. **Run a cron now from detail.** Click Run Now; a new row appears at the top of Run history as `running · …`. 1.5s later invalidate replaces it with the real run record (server id + actual timestamps).

5. **Rapid pause/resume toggling.** User clicks Pause, Resume, Pause in quick succession. Each click cancels the previous in-flight invalidate and commits its own optimistic state. The final state on the screen matches the final click. The final invalidate resolves to server truth.

6. **Error on pause.** User clicks Pause; pill flips to `paused`; API returns 500. Pill rolls back to `active` and toast "erro 500" appears. User can click Pause again.

## Success Criteria

1. `apps/dashboard/src/lib/use-optimistic-mutation.ts` exists with the typed generic signature shown in Design.
2. Five mutations in `mutations.ts` use the primitive; `useRestartWorker` does not (documented in comments).
3. Click → visible state change in <50ms — verified by Playwright:
   - Navigate to `/crons/$id`, click Pause, assert `text="paused"` appears within 100ms of click.
   - Click Resume, assert `text="active"` within 100ms.
   - Navigate to `/crons/new`, fill form, submit, assert redirect AND the new row appears in `/crons` within 100ms.
   - Click Run now, assert a new row with `status: running` appears in the history within 100ms.
   - Click Delete, confirm, assert the row is gone from `/crons` within 100ms.
4. Rollback verified: mock `apiFetch` to throw in a unit test; assert cache restores + error toast fires.
5. `pnpm run quality-gate` green.
6. No new runtime deps in `apps/dashboard/package.json`.
7. The primitive is documented in `context/conventions/code-style.md` as the default for new mutations.
8. An atomic learning is saved under `context/learnings/` capturing the pattern for future reference.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Optimistic divergence from server truth** (command fails async in worker) | `invalidateSoon` fires 1.5s after API response; the refetch overwrites with truth. User sees the phantom state change ("pill flipped then un-flipped"). Acceptable — it's correct behavior; a future spec can add command-outcome toasts. |
| **Race between concurrent mutations on the same row** | Each `onMutate` snapshots the cache at its own tick. Rollback composes: mutation 2's rollback restores to mutation 1's post-state, not the pre-anything state. `cancelQueries` handles in-flight refetches. |
| **Cache shape drift** (future `CronApi` field rename) | Generic types carry from `CronApi[] → (prev) => CronApi[]`. A shape change is a TypeScript error, not a runtime bug. |
| **Temp-id collision with real server IDs** | Temp IDs are always `tmp_<timestamp>_<counter>`. Server IDs are ULIDs (`01K...`). No overlap possible. |
| **`invalidateSoon` fires during rapid mutations and overwrites fresh optimistic writes** | Each `onMutate` calls `cancelQueries` before writing. An in-flight refetch cancels; the optimistic write wins until the next `invalidateSoon` from `onSettled`. |
| **Deeply nested cache shapes** (e.g., `['crons', id]` with `{ cron, recentRuns }`) | The updater function receives `prev` and returns the next value — callers do the spread themselves. Explicit, typed, no magic. |
| **Create mutation temp row flashes badly if invalidate is slow** | 1.5s is within TanStack's default observable delay. If flash becomes visible, bump the temp row to `opacity-100` (don't visually distinguish) — cache shape matches, React just re-keys. |
| **Unit tests flaky on timers** | Use `vi.useFakeTimers()` + `vi.runAllTimers()` per the pattern already in `apps/dashboard/tests/lib/home-subtitle.test.ts`. |
| **The primitive's generics confuse new contributors** | Keep the three-argument shape (`TVars`, `TResult`, implied context) minimal. One example per call site in `mutations.ts` is documentation by example. Plus the learning note explains the decision. |

## Open Questions

None blocking. Implementation-time decisions:

- **Temp-row visual treatment.** Implement `opacity-60 pointer-events-none` on rows where `id.startsWith('tmp_')`, or skip the visual distinction entirely? Default: implement it, because the temp row is real (briefly) and pointer-events-none prevents the user from clicking a cron with a fake id.
- **Should `useOptimisticMutation` expose the context shape publicly?** Today `MutationContext` is an opaque internal. If a consumer needs to inspect snapshots (e.g., for an undo toast in a future spec), expose it then. YAGNI for now.
