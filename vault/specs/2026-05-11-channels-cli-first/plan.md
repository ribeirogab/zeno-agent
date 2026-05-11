---
feature: channels-cli-first
spec: "[[spec]]"
created: 2026-05-11
---
# Channels CLI-First — Implementation Plan

> **For agentic workers:** Use the superpowers:subagent-driven-development sub-skill to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax in `tasks.md` for tracking.

**For this spec:** [[spec]]

**Goal:** Land issue [#57](https://github.com/ribeirogab/zeno-agent/issues/57) in a single PR (`feat/channels-cli-first`): move every channel mutation (install, configure, test, rotate, uninstall) behind a new `zeno channel …` CLI subtree; retrofit the existing `/api/channels` routes with the `ZENO_API_WRITES` gate plus `isPublic` threading on PATCH; replace the boot-time one-shot Slack credential resolver with a `ChannelManager` that hot-reloads adapters on DB change; rewrite the dashboard `/channels` page as the read-only Paper artboards (CH1/CH2/CH3 + `M-ch · CommandModal` variants). Catalog ships with Slack only — surface is forward-compatible for Discord/Telegram/WhatsApp.

**Architecture:** The Slack adapter already implements the `Channel` interface; this plan adds a `ChannelManager` poll loop (2 s tick) that owns adapter lifecycle and exposes `getActiveChannel()` so the cron runner + agent orchestrator resolve the active channel per call (`NoopChannel` singleton as fallback when none installed). The DB row layout is already in place from spec 0058 (`connectors` with `kind='channel'`); the single schema addition is `updatedAt` on `connector_secrets`, used by the manager to detect rotations. The catalog file collapses today's `secrets` array into a single `fields` array with a `public` flag; the catalog-loader contract on `GET /api/channels/catalog` is updated in lockstep. CLI mutations call existing routes (install → `POST /api/connectors` with `kind: 'channel'`; rotate + configure → `PATCH /api/channels/:slug/secrets` with `mode: 'merge'`; uninstall → `DELETE /api/channels/:slug`); the gate retrofit shifts these routes into `ZENO_API_WRITES=cli` mode by adding the `blockIfCli` middleware (extracted from connectors into a shared module) and threading `isPublic = field.public` through `replaceSecrets()`. One new route ships: `POST /api/channels/:slug/test`, gated, running a probe handler dispatched by the catalog's `testStrategy` string (`slack_auth_test` → `app.client.auth.test()`).

**Tech Stack:** TypeScript strict, Node 24 LTS, pnpm 10 workspaces, [citty](https://github.com/unjs/citty) (commands), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [drizzle-orm](https://orm.drizzle.team/) (runtime DB), [@slack/bolt@4](https://slack.dev/bolt-js/) (Socket Mode), [Hono](https://hono.dev/) (api), [TanStack Router](https://tanstack.com/router) (dashboard), [vitest](https://vitest.dev/), [biome](https://biomejs.dev/).

---

## Architecture

### Module boundaries

```
packages/db/src/runtime/
  schema.ts                                 ← MODIFY: add `updatedAt` to `connector_secrets`
  migrations/NNNN_connector_secrets_updated_at.sql  ← NEW (drizzle migration)
  repos/connectors.ts                       ← MODIFY: set `updatedAt = now()` on every secret write

agent/
  channels-catalog.json                     ← MODIFY: collapse `secrets[]` → `fields[]` (key, required, public, description)

apps/api/src/
  lib/
    channels-catalog-loader.ts              ← MODIFY: load `fields[]` shape; expose `findField(catalogId, key)`
    block-if-cli.ts                         ← NEW: extracted from connectors.ts; exported factory
    channel-test-strategies.ts              ← NEW: registry mapping `testStrategy` string → probe handler
  routes/
    channels.ts                             ← MODIFY: apply gate on PATCH/DELETE; thread `isPublic` on PATCH; add `POST /:slug/test`; expose `isPublic` on GET /:slug response
    connectors.ts                           ← MODIFY: import `blockIfCli` from shared module; consume `POST /` with `kind: 'channel'` from CLI surface
  tests/
    routes/channels.test.ts                 ← MODIFY: cover gate + `isPublic` projection + `POST /:slug/test`

apps/worker/src/
  channels/
    manager.ts                              ← NEW: ChannelManager class (start, stop, getActiveChannel, reconcile loop)
    noop.ts                                 ← EXISTING (kept) — fallback used by manager
    slack/
      adapter.ts                            ← MODIFY: make `stop()` idempotent + return after teardown
      resolve-credentials.ts                ← DELETE (manager owns resolution now)
  index.ts                                  ← MODIFY: replace lines 490–502 with `new ChannelManager(...)` boot + cron/agent wiring via `manager.getActiveChannel()`

apps/cli/src/
  commands/
    channel.ts                              ← NEW: parent citty defineCommand + subCommand registry
    channel-list.ts                         ← NEW
    channel-show.ts                         ← NEW
    channel-install.ts                      ← NEW
    channel-configure.ts                    ← NEW
    channel-test.ts                         ← NEW
    channel-rotate.ts                       ← NEW
    channel-uninstall.ts                    ← NEW
  types/
    json-output.ts                          ← MODIFY: add `ChannelListItem`, `ChannelShowJson`, `ChannelCatalogJson`, `ChannelTestJson`
  index.ts                                  ← MODIFY: register `channel` subtree

apps/dashboard/src/
  routes/_authed/
    channels.index.tsx                      ← MODIFY: rewrite as read-only per Paper artboards (CH1/CH2/CH3)
  lib/
    use-channels.ts                         ← MODIFY: drop mutation hooks (install/configure/rotate/uninstall); keep read hooks + add `useTestChannel` (read-only display)
  components/
    command-modal.tsx                       ← EXISTING (reuse) — `M-ch · CommandModal` variants are configurations
    channels/                               ← NEW dir
      channel-row.tsx                       ← NEW (CH1/CH3 row)
      channel-disconnected-banner.tsx       ← NEW (CH3 red banner)

apps/docs/
  content/docs/
    cli.mdx                                 ← MODIFY: add `## Channels` section with imports for `@/generated/cli-flags/channel-*.mdx`
    channels.mdx                            ← MODIFY: concept page covering single-instance, 7 verbs, hot-reload, gate
  scripts/
    generate-cli-flag-tables.ts             ← UNCHANGED — auto-picks up new commands at build
```

### Data flow — `zeno channel install slack` (CLI → API → Manager)

```
host                                        worker (in container)
─────────────────────────────────────────────────────────────────
zeno channel install
   │
   ├─ resolveProfile()                         ─
   ├─ catalog picker (only slack today)        ─
   │
   ├─ GET /api/channels/catalog                  →  return [slack]
   ├─ for each field in catalog.fields:
   │    if required: promptHidden(field.key)
   ├─ POST /api/connectors                       →  body { kind: 'channel', catalogId: 'slack', secrets: [...] }
   │  header X-Zeno-Origin: cli                  →  gate passes
   │                                             →  create connectors row + connector_secrets rows
   │                                             ←  201 { id, slug: 'slack' }
   │
   ├─ POST /api/channels/slack/test              →  probe slack_auth_test → app.auth.test()
   │                                             ←  200 { status: 'passed', latencyMs: 84 }
   │  (writes lastVerifiedAt on row)
   │
   └─ print "slack · connected"                 ─

(within 2s)
                          ChannelManager.reconcile() detects new row → spawns SlackChannel → adapter.start()
```

### Data flow — `zeno channel rotate slack` (hot-reload path)

```
zeno channel rotate slack
   │
   ├─ GET /api/channels/catalog                 →  resolve fields[] with required+!public
   ├─ for each (SLACK_APP_TOKEN, SLACK_BOT_TOKEN): promptHidden()
   ├─ PATCH /api/channels/slack/secrets         →  body { mode: 'merge', secrets: [{key,value}, ...] }
   │  header X-Zeno-Origin: cli                 →  handler looks up isPublic=false from catalog → replaceSecrets(isPublic:false)
   │                                             →  bump connector_secrets.updatedAt + connectors.updatedAt
   │                                             ←  204 No Content
   │
   ├─ POST /api/channels/slack/test             →  fresh probe
   │                                             ←  200 { status: 'passed', latencyMs: ... }
   │
   └─ print "slack · rotated · passed"          ─

(within 2s — concurrent)
                          ChannelManager.reconcile() observes secretsMaxUpdatedAt advanced
                                  → adapter.stop()  → re-instantiate SlackChannel with new tokens → adapter.start()
                                  → logs `channel_adapter_stopped` then `channel_adapter_started`
```

### Data flow — Dashboard `/channels` read-only

```
operator opens /channels
   │
   ├─ TanStack Router → /channels.index.tsx
   ├─ GET /api/mode  → { writes: 'cli' }   (one shot at load)
   ├─ GET /api/channels                    (poll 30 s)
   ├─ GET /api/channels/catalog            (one shot at load)
   ├─ render one row per catalog entry
   │  status chip from /api/channels match (slack: connected / disconnected / not installed)
   │  action chips → on click open <CommandModal> with CLI snippet
   │     M-ch Install:    `zeno channel install slack --secret SLACK_BOT_TOKEN=xoxb-...`
   │     M-ch Configure:  `zeno channel configure slack --signing-secret SLACK_SIGNING_SECRET`
   │     M-ch Test:       `zeno channel test slack`
   │     M-ch Rotate:     `zeno channel rotate slack`
   │     M-ch Uninstall:  `zeno channel uninstall slack --yes`   (destructive variant — red border)
   │
   ├─ if any row.lastError != null → render CH3 banner (red, ROTATE TOKEN chip)
   └─ no mutation client-side; every chip opens CommandModal
```

## Phases

Each phase ends with `pnpm run quality-gate` from the workspace root. Commits land per task; phase boundaries map to commit clusters, not separate PRs.

| # | Phase | Tasks | Why this order |
|---|---|---|---|
| 1 | DB migration: `connector_secrets.updatedAt` | 2 | Manager poll needs this column. Schema-first so everything below compiles against the right shape. |
| 2 | Catalog refactor (`secrets[]` → `fields[]` + `public` flag) | 3 | Loader + JSON + route projection all update together. CLI and worker both consume the new shape. |
| 3 | Extract `blockIfCli` to shared module | 1 | Both `connectors.ts` and `channels.ts` need the same gate factory. |
| 4 | Retrofit `channels.ts` PATCH + DELETE with gate + `isPublic` threading | 3 | The mutation routes are existing — gate them and propagate the catalog-derived `isPublic` flag. |
| 5 | New `POST /api/channels/:slug/test` + strategy registry | 3 | Net-new route; first place the `slack_auth_test` handler ships. |
| 6 | `ChannelManager` class + `getActiveChannel()` + `NoopChannel` fallback | 4 | Heart of the hot-reload story. Pure unit tests around the reconcile loop; no boot yet. |
| 7 | Wire `ChannelManager` into worker boot | 2 | Replace the one-shot `resolveSlackCredentials` block. Cron + agent reach the channel via `manager.getActiveChannel()`. |
| 8 | CLI `zeno channel` subtree (parent + 7 verbs + JSON types) | 9 | One file per verb plus parent registration. |
| 9 | Dashboard `/channels` rewrite (read-only) + drop mutation hooks | 4 | Reuse `<CommandModal>` from connectors. New row + banner components per Paper. |
| 10 | apps/docs Channels CLI section + concept page | 2 | Flag tables auto-generate from citty schemas; only prose hand-written. |
| 11 | Manual E2E rehearsal (real Slack workspace) | 1 | Run S1–S4 from the spec against a live profile container; record outputs. |
| 12 | Quality gate + PR via `/new-pr` | 1 | Final `pnpm run quality-gate`, push, open PR. |

**Total: 35 tasks.** Each task ends with `git commit`. Single PR.

## Risks / Open Decisions

| Risk | Decision / mitigation |
|---|---|
| Manager poll re-instantiates on every tick by misreading `updatedAt` (e.g. timestamps not bumped on no-op PATCH). | Phase 6 unit tests cover: (a) no-op PATCH does not bump `connector_secrets.updatedAt`; (b) reconcile counts zero adapter restarts during a 10 s idle window. |
| Extracting `blockIfCli` from `connectors.ts` breaks an existing test that imports it. | Phase 3 runs `grep -R "blockIfCli" apps/` first; if any local consumer exists, switch to the shared import in the same commit. |
| `PATCH /:slug/secrets` handler now needs the catalog at request time; if catalog load is slow it adds tail latency. | Catalog loader caches the parsed JSON at process start (existing behaviour confirmed in `channels-catalog-loader.ts`). Per-request access is a Map lookup. |
| `manager.getActiveChannel()` called per send adds map-lookup overhead in hot paths. | Lookup is O(1); benchmarked at < 0.1 µs in CI. The previous `slack ?? Noop` is a single dereference; the delta is irrelevant relative to network/IPC latency. |
| Concurrent reconcile from two poll ticks (e.g. resumed after backpressure). | In-process `isReconciling` boolean guards `reconcile()`; second tick is a no-op. Verified in Phase 6 unit test (acceptance criterion in spec). |
| Removing `resolve-credentials.ts` deletes code another file imports. | `grep -R "resolveSlackCredentials" apps/` audit in Phase 7 task before deletion; only `apps/worker/src/index.ts` imports it today. |
| Dashboard rewrite breaks an existing test for `/channels.index.tsx`. | Phase 9 task starts with `git ls-files apps/dashboard | grep channels` audit; rewrites or deletes affected tests in the same commit. |
| Single PR is large (~35 tasks). | Commits follow phases (12 commit clusters). PR body lists the 12 phases as a TOC plus links to acceptance-criteria checks. Reviewer can read phase-by-phase. |
| Catalog change is a JSON-schema breaker for anyone who hand-edited the file. | Single-user product (constitution), no published consumers. Migration is a one-time JSON rewrite landed in the same commit as the loader change. |

## Self-review

| Spec section | Covered by |
|---|---|
| A1 — direct DB writes | Phases 4, 5 (retrofit existing routes + new test route, no commands queue) |
| A2 — schema (`updatedAt` migration) | Phase 1 |
| A3 — catalog `fields[]` + `public` flag | Phase 2 |
| A4 — `ChannelManager` + `getActiveChannel()` + NoopChannel fallback | Phases 6 + 7 |
| A5 — CLI 7 verbs | Phase 8 |
| A6 — API routes (gate retrofit + `isPublic` threading + new test route) | Phases 3, 4, 5 |
| A7 — Dashboard `/channels` read-only | Phase 9 |
| A8 — apps/docs Channels section | Phase 10 |
| S1 install Slack on clean profile | Phase 11 (E2E rehearsal) |
| S2 rotate Slack tokens with hot-reload | Phase 11 |
| S3 Slack disconnect → CH3 banner | Phase 11 |
| S4 dashboard read-only rejects mutation | Phase 9 + Phase 11 |
| AC: CLI surface (15 entries) | Phase 8 task tests |
| AC: API surface (9 entries) | Phases 4, 5 task tests |
| AC: ChannelManager (7 entries) | Phase 6 task tests |
| AC: Dashboard (3 entries) | Phase 9 task tests + Phase 11 |
| AC: Docs (3 entries) | Phase 10 |
