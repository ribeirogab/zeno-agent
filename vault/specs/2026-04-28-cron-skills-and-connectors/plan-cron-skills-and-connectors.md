---
feature: cron-skills-and-connectors
spec: "[[spec-cron-skills-and-connectors]]"
created: 2026-04-28
---
# Cron ↔ Skills and Connectors — Plan

**For this spec:** `[[spec-cron-skills-and-connectors]]`

> **⚠️ Phase B mechanism revised post-R2 review.** The gate's anti-double-inject + audit-log mechanism shipped as **AsyncLocalStorage-based per-call state** with a single `runInCronContext(opts, fn)` method on `ConnectorGatedBackend`, NOT the instance-field `preInjectCronSkills`/`pendingCronSkillIds` design described below. The original design had two production bugs caught by the second 3-clean-rounds review of phase B:
> - F1: Throwaway-wrapper pattern in `apps/worker/src/index.ts` bound the SDK hook to a discarded instance, so `preInjectCron*` calls on the OUTER wrapper never reached the hook.
> - F2: `cron_run_now` chat tool fires `void runner.runOnce(...)` (fire-and-forget). Concurrent cron firings on the same backend instance would race the `pendingCron*` instance fields.
>
> **The shipped implementation uses ALS scopes per await chain (race-free) + a lazy hook ref pattern (binds the SDK hook to the OUTER wrapper).** See `spec.md` lines 48 + 61 for the canonical mechanism, and `apps/worker/src/guardrails/connector-gated-backend.ts` for the implementation. The Phase B narrative below is historical — only the gate-API surface changed; storage / API / dashboard / file structure are unchanged.

## Approach

The work breaks into four concerns layered on the existing spec 0052 + 0053 mechanism:

1. **Schema (storage layer).** Two migrations: (16) `cron_skills` table, (17) `cron_connectors` table. Both M:N with `FK ... ON DELETE CASCADE` on both columns, PK `(cron_id, *_id)`. Two new repos (`CronSkillRepo`, `CronConnectorRepo`) directly mirror `ConnectorSkillRepo` (`replaceForCron` atomic + `listForCron` + `listForSkill`/`listForConnector` for inverse lookups + `add`/`remove`).

2. **Worker runner — force-injection + audit + anti-double-inject.** The cron runner today calls `backend.query()` with `cron.prompt` UNGUARDED. To make the spec's design actually work, **the cron backend gets wrapped with `ConnectorGatedBackend`** (the user-facing wrapper from spec 0050), making it the single guardrail for both interactive and cron paths. The runner then:
   - Reads `cronSkillRepo.listForCron(cron.id)` + `cronConnectorRepo.listForCron(cron.id)`.
   - Builds a `[zeno_context]…[/zeno_context]` block (mirrors `[slack_context]` from `core.ts:142-179`) with linked-skill bodies + linked-connector slugs, capped at ~20 KB.
   - Calls `backend.preInjectCronSkills([...skillIds])` and `backend.preInjectCronContext({ runId, linkedSlugs })` BEFORE `backend.query()` so the gate's hook can:
     (a) populate `injectedSkillsCache` keyed at `${sessionKey}:skill:${skillId}` to dedupe with spec 0052's `connector_skills` injection, and
     (b) emit `cron_used_unlinked_connector` once per `(runId, slug, toolName)` triplet when the cron uses a connector that isn't in its link list.
   - The wrapper's `query()` clears both fields in a `finally` block.
   - The runner emits `cron_skill_injected` (always when force-injection happens) and `cron_skill_truncated` (only when the bytes cap kicks in).

3. **`getInjectionContext` rewrite (skill-level cache).** Today's `connector-gated-backend.ts:62-84` caches at the connector-slug level (`${sessionKey}:${slug}` → mark-and-skip the whole connector). The new design caches per skill: `${sessionKey}:skill:${skillId}`. On every hook call for `mcp__<slug>__*`, iterate `connectorSkillRepo.listForConnector(connector.id)`, filter to skills NOT yet in `injectedSkillsCache`, build the body with only those, and stamp them as injected. If all are already cached → return null (no body). This is a **rewrite, not an additive change**.

4. **API + Dashboard (mirrors spec 0052).** Two new sub-routes mounted under `/api/crons/:id/skills` and `/api/crons/:id/connectors` (GET/PATCH, replace-all semantics). Two new dashboard hooks (`use-cron-skills`, `use-cron-connectors`). Two new sections on the cron detail page that reuse the same component pattern as `LinkedSkillsSection`/`LinkSkillPickerModal`. Empty-link semantics = full back-compat for existing crons.

## Architecture

### Cron run data flow

```
┌───────────────────────────────────────────────────────────┐
│  Cron tick (60s) — runner.tick()                          │
│                                                            │
│  1. crons.due(now)                                         │
│  2. for each due cron:                                     │
│       linkedSkills    = cronSkillRepo.listForCron(id)      │
│       linkedConnSlugs = cronConnectorRepo.listForCron(id)  │
│                                  .map(c => c.slug)         │
│       block           = buildZenoContextBlock(             │
│                           linkedSkills, linkedConnSlugs,   │
│                           CAP_BYTES                        │
│                         )                                  │
│       userMessage     = block + cron.prompt                │
│                                                            │
│       backend.preInjectCronSkills(linkedSkills.map(.id))   │
│       backend.preInjectCronContext({ runId, linkedSlugs }) │
│       output         = await backend.query({ userMessage })│
│       (finally: backend pendingCron* fields cleared)       │
└───────────────────────────────────────────────────────────┘
                                ↓
┌───────────────────────────────────────────────────────────┐
│  ConnectorGatedBackend (wraps cron + chat backends)       │
│                                                            │
│  query() {                                                 │
│    try { return await inner.query(input); }                │
│    finally {                                               │
│      this.pendingCronSkillIds = [];                        │
│      this.pendingCronContext  = null;                      │
│    }                                                       │
│  }                                                         │
│                                                            │
│  PreToolUse hook (per tool call):                          │
│    1. Transfer pendingCronSkillIds → injectedSkillsCache   │
│       (idempotent Map.set with skill-level keys).          │
│    2. checkConnectorPermission → allow/deny.               │
│    3. If allow + tool is mcp__<slug>__:                    │
│       a. getInjectionContext (rewritten) — iterate         │
│          connectorSkillRepo.listForConnector, skip cached  │
│          skills, build body with the rest. Returns null    │
│          if all are cached (cron pre-injected them).       │
│       b. If pendingCronContext set + slug ∉ linkedSlugs    │
│          + (runId,slug,tool) NOT in dedup set →            │
│          log `cron_used_unlinked_connector`.               │
└───────────────────────────────────────────────────────────┘
```

### Component breakdown

| Component | New / Modified | Responsibility |
|---|---|---|
| `packages/storage/src/migrations.ts` | Modified | Append migrations 16 (cron_skills) + 17 (cron_connectors). |
| `packages/storage/src/types.ts` | Modified | Add `CronSkillLink`, `CronConnectorLink` interfaces. |
| `packages/storage/src/repos/cron-skills.ts` | New | Mirrors `ConnectorSkillRepo` for cron↔skill links. |
| `packages/storage/src/repos/cron-connectors.ts` | New | Mirrors `ConnectorSkillRepo` for cron↔connector links. |
| `packages/storage/src/index.ts` | Modified | Re-export new repos + types. |
| `apps/worker/src/cron/runner.ts` | Modified | Read links, build block, call `preInjectCron*`, prepend, log. |
| `apps/worker/src/cron/zeno-context-block.ts` | New | Pure builder for the `[zeno_context]` block + bytes-cap truncation. Exported for unit test. |
| `apps/worker/src/guardrails/connector-gated-backend.ts` | Modified (rewrite) | New fields `pendingCronSkillIds` + `pendingCronContext`; new methods `preInjectCronSkills` + `preInjectCronContext`; `query()` finally-clear; rewritten `getInjectionContext` with skill-level cache + unlinked-connector audit log. |
| `apps/worker/src/index.ts` | Modified | Wrap the cron-runner backend with `ConnectorGatedBackend` (today it's UNGUARDED — see spec 0054 §3). Wire new repos into route deps. |
| `apps/api/src/routes/cron-skills.ts` | New | `GET/PATCH /api/crons/:id/skills`. Mirrors `connector-skills.ts`. |
| `apps/api/src/routes/cron-connectors.ts` | New | `GET/PATCH /api/crons/:id/connectors`. |
| `apps/api/src/server.ts` | Modified | Mount the two new sub-routes under `/api/crons` (auth covered by existing middleware). |
| `apps/api/src/index.ts` | Modified | Construct + pass the new repos. |
| `apps/dashboard/src/lib/use-cron-skills.ts` | New | TanStack Query hooks `useCronSkills`, `useReplaceCronSkills`. |
| `apps/dashboard/src/lib/use-cron-connectors.ts` | New | `useCronConnectors`, `useReplaceCronConnectors`. |
| `apps/dashboard/src/components/crons/linked-skills-section.tsx` | New | Cron-side mirror of `components/skills/linked-skills-section.tsx`. |
| `apps/dashboard/src/components/crons/linked-connectors-section.tsx` | New | Cron-side mirror for connectors (lighter — connector display name + slug, no body). |
| `apps/dashboard/src/components/crons/link-skill-picker-modal.tsx` | New | Multi-select picker mirroring `link-skill-picker-modal.tsx`. |
| `apps/dashboard/src/components/crons/link-connector-picker-modal.tsx` | New | Multi-select picker for connectors. |
| `apps/dashboard/src/routes/_authed/crons.$id.tsx` | Modified | Render the two new sections under the prompt block. |
| Test files | New / Modified | `migrations.test.ts`, `db.test.ts`, `cron-skills.test.ts`, `cron-connectors.test.ts` (storage); `cron-runner.test.ts` (worker), `connector-gated-backend.test.ts` (guardrails); `cron-skills.test.ts`, `cron-connectors.test.ts` (api routes). |

## File Structure

### New
- `packages/storage/src/repos/cron-skills.ts`
- `packages/storage/src/repos/cron-connectors.ts`
- `packages/storage/tests/cron-skills.test.ts`
- `packages/storage/tests/cron-connectors.test.ts`
- `apps/worker/src/cron/zeno-context-block.ts`
- `apps/worker/tests/cron/zeno-context-block.test.ts`
- `apps/worker/tests/cron/runner-injection.test.ts`
- `apps/api/src/routes/cron-skills.ts`
- `apps/api/src/routes/cron-connectors.ts`
- `apps/api/tests/routes/cron-skills.test.ts`
- `apps/api/tests/routes/cron-connectors.test.ts`
- `apps/dashboard/src/lib/use-cron-skills.ts`
- `apps/dashboard/src/lib/use-cron-connectors.ts`
- `apps/dashboard/src/components/crons/linked-skills-section.tsx`
- `apps/dashboard/src/components/crons/linked-connectors-section.tsx`
- `apps/dashboard/src/components/crons/link-skill-picker-modal.tsx`
- `apps/dashboard/src/components/crons/link-connector-picker-modal.tsx`

### Modified
- `packages/storage/src/migrations.ts` — append migrations 16, 17
- `packages/storage/src/types.ts` — add `CronSkillLink`, `CronConnectorLink`
- `packages/storage/src/index.ts` — re-export new repos + types
- `packages/storage/tests/db.test.ts` — bump migration count to 17
- `packages/storage/tests/migrations.test.ts` — assert tables exist + cascade behavior
- `apps/worker/src/cron/runner.ts` — read links, build block, prepend, pre-inject, log
- `apps/worker/src/guardrails/connector-gated-backend.ts` — pendingCron* fields, methods, finally-clear, rewritten `getInjectionContext`, audit hook
- `apps/worker/src/index.ts` — wrap cron backend with gate, wire new repos
- `apps/worker/tests/guardrails/connector-gated-backend.test.ts` — anti-double-inject + audit tests
- `apps/api/src/routes/crons.ts` — n/a (sub-routes mounted in server.ts)
- `apps/api/src/server.ts` — mount `/api/crons/:id/skills` + `/api/crons/:id/connectors`
- `apps/api/src/index.ts` — construct + pass new repos to `createApp`
- `apps/dashboard/src/routes/_authed/crons.$id.tsx` — render new sections

### Deleted
None.

## Phase Ordering

Hard ordering — earlier phases are dependencies of later ones.

```
A. Storage (migrations 16 + 17 + repos + tests)
   ↓
B. Worker (runner + zeno-context-block builder + gated-backend rewrite + cron-backend wrap + tests)
   ↓
C. API (routes + server.ts wiring + tests)
   ↓
D. Dashboard (hooks + components + cron-detail wiring)
   ↓
E. Quality gate + Docker boot test
   ↓
F. E2E via Slack on fn profile
   ↓
G. Final 3-round review on whole branch
   ↓
H. Push + open PR (with explicit OK)
```

A → B → C are strictly serial (B reads A's repos, C reads A's repos and is consumed by D). D depends on C only for the API contract; the components themselves can start in parallel once C lands. E onwards is serial.

Each phase ends with a commit + `pnpm -w run quality-gate`. Per Rule 2, after the implementer thinks any subtask is done they review 3 times (R1/R2/R3) — any finding resets the counter.

## Risks / Open Decisions

- **Cron backend wrap is a behavior change.** Today, `apps/worker/src/index.ts:365` builds an UNGUARDED backend for the cron runner with the comment "Crons still run UNGUARDED (their `userMessage` has no requester context)". This plan wraps the cron backend with `ConnectorGatedBackend` so the spec's anti-double-inject + audit-log designs actually apply. The "no requester context" rationale doesn't impact gate decisions (the gate uses tool name + connector permission table, both static). After spec 0053 migration 13 flipped dev caps default-on, gating crons does not break previously-working capabilities. **Verify** in Phase E (Docker boot test) that existing crons still run end-to-end after the wrap.

- **Concurrency assumption (serial cron ticks).** The anti-double-inject mechanism uses `pendingCronSkillIds` + `pendingCronContext` instance fields on `ConnectorGatedBackend`. This works because the cron runner processes due crons sequentially in its tick loop (today it `await`s each `execute()` before moving to the next). If a future change parallelizes cron ticks per-cron, this state machine breaks. Mitigated by an explicit comment in the gated backend pointing to the runner's serial-tick contract.

- **Skill-level cache rewrite breaks slug-level callers.** No external caller uses `getInjectionContext` (it's a private method); the rewrite is internal. But Phase B must keep the existing `connector-gated-backend.test.ts` cases (that exercise the cache from the slug perspective) green by adapting them to the new keys.

- **Audit-log dedup memory.** `pendingCronContext.dedupSet` is a `Set<string>` per cron run. For a cron that uses 1k tool calls in one run the set is at most ~1k entries — negligible. Cleared in the wrapper's `finally`.

- **Bytes-cap truncation drops from the tail.** The simplest cap (concat all skill bodies, hard-cut at 20 KB) drops the tail. If a cron links 4 skills and the 4th gets truncated, the operator sees `droppedSkills: ['skill-d']` in the log. Acceptable for v1 — spec 0054 § Out-of-scope captures the smarter-truncation follow-up.

- **`replaceForCron` race with the runner.** While the runner builds the block, the dashboard could PATCH the link list. Per spec § Risks, the repo's `INNER JOIN skills`/`INNER JOIN connectors` silently skips deleted-but-link-still-pointing rows; the new repos must mirror this. A worst-case race shows the operator's previous link set on this fire and the new one next fire — acceptable.

- **Dashboard state freshness after PATCH.** `useReplaceCron*` invalidates `['cron-skills', cronId]` + `['cron-connectors', cronId]` so the section re-renders. Existing pattern via `useOptimisticMutation` (mirroring `useReplaceConnectorSkills`).

- **`route-tree.gen.ts` regeneration.** The dashboard uses TanStack Router's file-based routing. Touching `crons.$id.tsx` doesn't add or remove routes, so the gen tree shouldn't change. If a typecheck failure surfaces a stale tree, run `pnpm --filter @zeno/dashboard run build` to regenerate.

- **Empty link sets render the empty state, not the picker.** Mirror the existing `LinkedSkillsSection`'s "No skills linked" pattern with a `+ link` CTA. Don't auto-open the picker.
