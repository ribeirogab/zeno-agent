---
feature: dashboard-optimistic-updates
plan: "[[plan-dashboard-optimistic-updates]]"
spec: "[[spec-dashboard-optimistic-updates]]"
created: 2026-04-17
---
# Dashboard Optimistic Updates — Tasks

**For this plan:** `[[plan-dashboard-optimistic-updates]]`

---

## Phase 1 — Primitive + helpers

- [ ] Create `apps/dashboard/src/lib/format-error.ts`. Export `formatError(err: unknown): string` — the existing inline version from `mutations.ts`, unchanged behavior.
- [ ] Create `apps/dashboard/src/lib/temp-id.ts`. Module-level counter + `tempId(prefix: string): string` returning `${prefix}_tmp_${Date.now()}_${counter}`.
- [ ] Create `apps/dashboard/src/lib/use-optimistic-mutation.ts`. Implement the primitive exactly as in spec.md Design section. Types are strict: `TVars`, `TResult`, internal `MutationContext`.
- [ ] Create `apps/dashboard/tests/lib/use-optimistic-mutation.test.ts`. Cover: (a) optimistic write + success + invalidate via fake timers, (b) optimistic write + error + rollback, (c) multi-cache snapshot/restore, (d) no-optimisticUpdate degrades to plain mutation + toast.
- [ ] `pnpm run quality-gate` green.
- [ ] Commit: `feat(dashboard): useOptimisticMutation primitive + format-error/temp-id helpers`.

## Phase 2 — Migrate mutations

- [ ] Rewrite `usePauseCron` in `mutations.ts` to use primitive. Optimistic: `enabled: false` on `['crons']` + `['crons', id]`.
- [ ] Rewrite `useResumeCron`. Optimistic: `enabled: true`.
- [ ] Rewrite `useDeleteCron`. Optimistic: remove from `['crons']`.
- [ ] Rewrite `useCreateCron`. Optimistic: prepend temp cron to `['crons']`. Temp cron shape matches `CronApi` with `id: tempId('cron')`, `source: 'chat'`, `createdBy: 'dashboard'`, `createdAt`/`updatedAt` = now ISO, `lastRunAt`/`nextRunAt` null, `enabled: true`.
- [ ] Rewrite `useRunNowCron`. Optimistic: prepend provisional run to `['crons', id].recentRuns`. Temp run: `id: tempId('run')`, `status: 'running'`, `startedAt` = now ISO, `finishedAt: null`, `output: null`, `error: null`.
- [ ] Leave `useRestartWorker` unchanged. Add a comment: `// no cache effect — plain useMutation`.
- [ ] Remove the old inline `formatError` from `mutations.ts`.
- [ ] `pnpm run quality-gate` green.
- [ ] Commit: `refactor(dashboard): five cron mutations use useOptimisticMutation`.

## Phase 3 — Temp-row polish

- [ ] In `cron-row.tsx`, add `const isPending = cron.id.startsWith('cron_tmp_');` and apply `opacity-60 pointer-events-none` to the Link className when pending.
- [ ] In `cron-run-history-row.tsx`, add `const isPending = run.id.startsWith('run_tmp_');` and apply `opacity-60` to the row container className when pending.
- [ ] `pnpm run quality-gate` green.
- [ ] Commit: `feat(dashboard): dim temp rows while optimistic insert awaits server`.

## Phase 4 — Docs

- [ ] Add a "Dashboard mutations" section to `context/conventions/code-style.md` explaining: use `useOptimisticMutation` for any mutation with a cache effect; pattern example; the two helpers.
- [ ] Create `context/learnings/optimistic-mutation-pattern.md` (atomic note, use `context/templates/learning.md`).
- [ ] Update `context/_index/conventions.md` and `context/_index/learnings.md` with links.
- [ ] Commit: `docs: optimistic-mutation as the project pattern`.

## Phase 5 — Playwright smoke

- [ ] `pnpm run docker:build && pnpm run docker:up`; wait 10s.
- [ ] Via Playwright MCP: navigate to `/crons/<id>`, click Pause, assert pill text `paused` inside 100ms window. Screenshot.
- [ ] Click Resume, assert pill text `active` inside 100ms. Screenshot.
- [ ] Navigate to `/crons`, click a different cron to go to detail, click Delete → confirm, assert return to `/crons` AND the row is absent. Screenshot.
- [ ] Navigate to `/crons/new`, fill the form, submit, assert redirect to `/crons` AND a new dimmed row appears. Wait 2s. Assert the dim clears.
- [ ] On a cron detail page, click Run now, assert a new run with status `running` appears in the history. Wait 2s. Assert it reconciles.
- [ ] `pnpm run docker:down`.
- [ ] Commit (if any screenshots retained as evidence; screenshots live under `.playwright-mcp/` which is gitignored so this might be a no-op commit).

## Done

- [ ] `pnpm run quality-gate` final run.
- [ ] Flip `status: draft` → `status: shipped` in spec.md frontmatter, set `shipped: 2026-04-17`.
- [ ] Move 0019 from Active → Shipped in `context/_index/specs.md`.
- [ ] Update PR #4 body with a new "Spec 0019" section.
- [ ] `git push`.
