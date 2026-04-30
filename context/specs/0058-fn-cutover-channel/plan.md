---
feature: fn-cutover-channel
spec: "[[spec]]"
created: 2026-04-29
---
# Spec 0058 — Migrate `profiles/fn` to channel connector — Plan

**For this spec:** `[[spec]]`

## Approach

Mostly EXECUTIVE (commands run live against `profiles/fn` + dashboard + container) with one CODE phase at the end (Phase H — remove `.env` fallback). Phases A-G produce no commits — they're operational; the spec narrative + the Phase H code change + a learning note constitute the entire PR diff.

The cutover must NOT break Operator's daily Slack→Zeno workflow. Strategy: ~10-min maintenance window during which Operator pauses Slack-Zeno usage; container restarts cause ~10s non-responsiveness twice; the rest of the time is API/file editing while the container runs normally.

Phase ordering is strict and load-bearing — each phase blocks the next, with explicit verification gates between them. Rollback table covers each failure point with the smallest reversal that restores Slack→Zeno.

## Architecture

```
                        ┌────────────────────────────────┐
                        │ Pre-flight checks (A.1-5)      │
                        │  - PR mergeable                 │
                        │  - PR diff has 7 surfaces       │
                        │  - SlackChannel spread replaced │
                        │  - .env backed up to tmp/       │
                        └─────────────┬──────────────────┘
                                      ▼
                  ┌─── CHECKPOINT (operator consent) ───┐
                  │  • merge PR #22                      │
                  │  • pnpm run docker:build (shared)    │
                  │  • PROFILE=fn docker:down + up       │
                  └─────────────┬───────────────────────┘
                                ▼
                ┌────────────────────────────────────┐
                │ Post-rebuild verification (A.6-9)   │
                │  - zeno_online + slack_connected    │
                │  - channels-catalog.json + svg      │
                │  - migration 18 applied             │
                │  - slack_creds_source: env_fallback │
                └─────────────┬──────────────────────┘
                              ▼
              [B] heads-up to C0EXAMPLE001 ── 🚧 cutover em progresso
                              ▼
              [C.1-2] login + GET /api/channels/catalog
                              ▼
              [C.3] POST /api/connectors with kind=channel
                              ▼
              [C.4] GET /api/channels — capture id
                              ▼
              [C.5] GET /api/connectors/<id> — verify kind=='channel' ◄── BLOCKING gate
                              ▼
              [D] edit profiles/fn/.env — remove SLACK_*_TOKEN
                              ▼
              [E.1] PROFILE=fn docker:down → docker:up (cold restart)
                              ▼
              [E.2-3] verify slack_creds_source: connector_secrets
                              ▼
              [F.1] Tier 1: <@zeno> oi → response
                              ▼
              [F.2] Tier 2: skill invocation end-to-end
                              ▼
              [G] all-clear to C0EXAMPLE001 ── ✅ cutover completo
                              ▼
              [H] code cleanup commit (resolver simplification)
                              ▼
              [3-round branch review on the doc + Phase H diff]
                              ▼
              [Push + open PR]
```

## File Structure

### Created

- `context/specs/0058-fn-cutover-channel/spec.md` — already committed
- `context/specs/0058-fn-cutover-channel/plan.md` — this file
- `context/specs/0058-fn-cutover-channel/tasks.md` — the bite-sized task list
- `context/learnings/<atomic-note>.md` — created end of Phase H, documents "channels share storage with MCP via discriminator" pattern + the 6-row→4-row resolution table simplification

### Modified (Phase H only)

- `apps/worker/src/channels/slack/resolve-credentials.ts` — simplified resolver (4 cases, no env fallback, drops `env` from deps and `source` from return)
- `apps/worker/tests/channels/slack/resolve-credentials.test.ts` — 6 cases → 4 cases
- `apps/worker/tests/channels/slack/boot-integration.test.ts` — 2 cases → 1 case (env fallback path removed)
- `apps/worker/src/config.ts` — removes `SLACK_*_TOKEN` from Zod schema; removes `slack` from `Config` type
- `apps/worker/tests/config.test.ts` — drops SLACK-related tests by grep (preserves `CLAUDE_CODE_OAUTH_TOKEN` test)
- `apps/worker/src/index.ts` — drops `env: config.slack` from the `resolveSlackCredentials(...)` call site
- `context/specs/0057-slack-channel/spec.md` — appends 1-line errata note about the resolution table simplification

### Operational artifacts (NOT committed)

- `tmp/profiles-fn-env-backup-<isodate>.env` — backup created in Phase A.5; gitignored under `tmp/`
- `profiles/fn/.env` — edited in Phase D to remove `SLACK_*_TOKEN`; not committed (`.env` files are gitignored)

### Deleted

None.

## Phase Ordering

Hard ordering — each phase blocks the next. No parallelism. Reset to start of phase on any verification failure (per rollback table in spec.md).

```
A — Pre-flight + merge + rebuild     [CHECKPOINT: operator consent for merge + rebuild + restart]
   ↓
B — Heads-up to C0EXAMPLE001
   ↓
C — Install Slack channel via API    [BLOCKING gate at C.5 kind round-trip]
   ↓
D — Remove SLACK_*_TOKEN from .env
   ↓
E — Cold restart + DB-path verification
   ↓
F — Tier 1 + Tier 2 validation
   ↓
G — All-clear post
   ↓
H — Code cleanup commit              [single code phase]
   ↓
Branch 3-round review                [reset on any blocking finding per Rule 2]
   ↓
Push + open PR
```

## Risks / Open Decisions

All Q1-Q5 closed in spec.md. Operational risks tracked in spec.md "Risks and Mitigations" table.

The single OPEN risk that depends on PR #22's actual diff: whether PR #22 wired `kind` into the connector detail endpoint response (`buildListItem` currently emits hardcoded `kind: 'connector'`). Phase C.5 verification gate catches this — if it fails, Stage A rollback + fix PR #22 before re-running.

The plan deliberately includes pre-flight grep checks (A.3, A.4) that read PR #22's diff to verify the 7 surfaces landed. This is a circuit breaker — better to fail fast at A.3 than at C.3 with a half-installed channel.

## Self-Review

After authoring plan.md + tasks.md, verify:

- [ ] Every spec section has at least one task in tasks.md.
- [ ] Phase ordering A→B→C→D→E→F→G→H is consistent between plan.md and tasks.md.
- [ ] Each Phase A-G task lists its EXACT command (curl, docker, sqlite3) and expected output.
- [ ] Phase H tasks use TDD: write failing test → impl → run test → commit, OR adjust existing tests + verify quality gate.
- [ ] No `pnpm run docker:up`/`docker:down` from a worktree CWD other than the main repo (worktree doesn't have `infra/`).
- [ ] All curl commands use the auth cookie set in Phase C.1.
- [ ] Rollback steps are runnable (e.g. "delete connector by id" includes both API and DB-fallback commands).
- [ ] No fictional log event names — every `event: '...'` is one observed in the actual codebase OR explicitly tagged "verify post-merge".
- [ ] Each commit message clearly identifies which Phase (only Phase H produces commits).
