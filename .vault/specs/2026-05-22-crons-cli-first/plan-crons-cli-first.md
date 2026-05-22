---
feature: crons-cli-first
spec: "[[spec-crons-cli-first]]"
created: 2026-05-22
---
# Crons CLI-First — Implementation Plan

> **For agentic workers:** Use the superpowers:subagent-driven-development sub-skill to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax in `tasks.md` for tracking.

**For this spec:** [[spec-crons-cli-first]]

**Goal:** Land issue [#58](https://github.com/ribeirogab/zeno-agent/issues/58) in a single PR (`feat/crons-cli-first`): flip the source of truth for cron definitions from the runtime DB to per-profile filesystem markdown files (`~/.zeno/profiles/<name>/crons/<slug>/CRON.md`), add a `zeno cron …` CLI subtree of eight verbs, replace the existing DB-scan cron runner with a poll-based `CronManager`, retrofit the API surface (`/api/crons*`) to read-only plus a single gated `POST /:slug/test`, and rewrite the dashboard `/crons` page as a read-only `<CommandModal>`-driven view per the rule in `[[../../rules/cli-only-mutations]]`.

**Architecture:** A new `CronManager` (`apps/worker/src/cron/manager.ts`) walks `/app/crons/*/CRON.md` every 2 s, parses YAML frontmatter (name, description, schedule, enabled) plus the body (the prompt), and upserts a slim `crons` row containing only the runtime cache + a content hash and mtime so the next tick's diff is O(N). The DB stores no prompt and no user-authored content; the legacy `prompt`, `source`, `created_by`, `notify_conversation_id`, `notify_thread_id`, `created_at` columns are dropped and the column `crons.id` semantics flip from UUID to slug (clean-slate `DELETE FROM crons` makes the value-space change collision-free). `cron_runs` gains a nullable `session_id` column populated from `AgentBackend.query()`'s `AgentOutput.sessionId`. CLI mutation verbs (`create`, `enable`, `disable`, `delete`) operate on the filesystem directly — no HTTP — and rely on the reconciler picking up changes on the next poll tick. Only `zeno cron test` is HTTP (`POST /api/crons/:slug/test`, gated by `ZENO_API_WRITES=cli` + `X-Zeno-Origin: cli`); the dashboard never calls that route. The legacy `cron_skills` / `cron_connectors` tables and their API routes stay in the codebase untouched (Non-Goal); only the dashboard's read and write paths to those joins are deleted.

**Tech Stack:** TypeScript strict, Node 24 LTS, pnpm 10 workspaces, [citty](https://github.com/unjs/citty) (commands), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [drizzle-orm](https://orm.drizzle.team/) (runtime DB), [gray-matter](https://github.com/jonschlinkert/gray-matter) (YAML frontmatter — to be added to `apps/worker/package.json`), [cron-parser](https://github.com/harrisiirak/cron-parser) (schedule validation), [Hono](https://hono.dev/) (api), [TanStack Router](https://tanstack.com/router) (dashboard), [vitest](https://vitest.dev/), [biome](https://biomejs.dev/).

---

## Architecture

### Module boundaries

```
packages/db/src/runtime/
  schema.ts                                  ← MODIFY: slim `crons` cols, add session_id to cron_runs
  migrations/NNNN_crons_filesystem_truth.sql ← NEW (drizzle migration: drop columns, add columns, clean-slate)
  repos/crons.ts                             ← MODIFY: rewrite for slim schema (no prompt, slug=id)

agent/
  (no changes — crons live per-profile, not in committed agent assets)

templates/profile/crons/                     ← NEW dir
  _README.md                                 ← NEW (operator-facing how-it-works)
  _template/CRON.md                          ← NEW (blank scaffold)

apps/api/src/
  routes/
    crons.ts                                 ← REWRITE: GET list, GET /:slug, GET /:slug/source, POST /:slug/test, GET /next; remove POST/PATCH/DELETE/pause/resume/run-now
  lib/
    cron-test-runner.ts                      ← NEW: invoked by POST /:slug/test; resolves CRON.md, calls agent backend, returns { sessionId, status, latencyMs, error? }
  tests/
    routes/crons.test.ts                     ← REWRITE: cover gate, response shapes, removed routes
    lib/cron-test-runner.test.ts             ← NEW

apps/worker/src/
  cron/
    manager.ts                               ← NEW: CronManager class (start, stop, reconcile, fire)
    parser.ts                                ← KEEP (cron expr utilities — already used by existing runner)
    frontmatter.ts                           ← NEW: parses CRON.md, validates name/schedule/enabled/body, returns ParsedCron
    rewrite-frontmatter.ts                   ← NEW: atomic enable/disable helper (parse → set flag → serialize → tmp + rename)
    zeno-context-block.ts                    ← MODIFY: drop notify-config refs; inject `working dir: /app/crons/<slug>`
    tools.ts                                 ← KEEP unchanged
    runner.ts                                ← DELETE (replaced by manager.ts)
  index.ts                                   ← MODIFY: wire CronManager into boot, replace existing runner construction

apps/cli/src/
  commands/
    cron.ts                                  ← NEW: parent citty defineCommand + subCommand registry
    cron-list.ts                             ← NEW
    cron-show.ts                             ← NEW
    cron-create.ts                           ← NEW
    cron-open.ts                             ← NEW
    cron-enable.ts                           ← NEW
    cron-disable.ts                          ← NEW
    cron-delete.ts                           ← NEW
    cron-test.ts                             ← NEW
    profile-create.ts                        ← MODIFY: also scaffold profile crons/ folder from templates
  lib/
    cron-paths.ts                            ← NEW: helpers for crons dir resolution, slug validation, atomic write
    cron-frontmatter.ts                      ← NEW: same parser as worker (extracted to lib for DRY) OR worker exports it (decide at impl time)
  types/
    json-output.ts                           ← MODIFY: add CronListItem, CronShowJson, CronTestJson
  index.ts                                   ← MODIFY: register `cron` subtree

apps/dashboard/src/
  routes/_authed/
    crons.index.tsx                          ← REWRITE: read-only table, action chips → CommandModal
    crons.$id.tsx                            ← REWRITE: properties block + body markdown + run history, all read-only
    index.tsx                                ← MODIFY: NextCronModel loses notifyConversationId
  components/
    crons/
      cron-row.tsx                           ← KEEP (read-only render)
      cron-status-pill.tsx                   ← KEEP unchanged
      cron-run-history-row.tsx               ← MODIFY: render session_id column
      cron-actions.tsx                       ← REWRITE: open <CommandModal> per chip
      cron-row-actions.tsx                   ← DELETE
      cron-form.tsx                          ← DELETE
      schedule-picker.tsx                    ← DELETE
      link-skill-picker-modal.tsx            ← DELETE
      link-connector-picker-modal.tsx        ← DELETE
      linked-skills-section.tsx              ← DELETE
      linked-connectors-section.tsx          ← DELETE
    modals/
      new-cron-modal.tsx                     ← DELETE
      delete-cron-modal.tsx                  ← DELETE
    home/
      next-cron-item.tsx                     ← KEEP (read-only)
  lib/
    use-crons.ts                             ← MODIFY: keep read hooks, drop mutation hooks (usePauseCron, useResumeCron, useRunNowCron, useDeleteCron — confirm exact location)
    use-cron.ts                              ← MODIFY: drop mutation hook for detail
    use-next-crons.ts                        ← MODIFY: drop notifyConversationId from NextCron type
    use-cron-skills.ts                       ← DELETE
    use-cron-connectors.ts                   ← DELETE
    cron-schedule.ts                         ← DELETE

apps/docs/
  content/docs/
    cli.mdx                                  ← MODIFY: add `## Crons` section with imports for @/generated/cli-flags/cron-*.mdx
    crons.mdx                                ← REWRITE: filesystem-as-truth + 8-verb flow
  scripts/
    generate-cli-flag-tables.ts              ← UNCHANGED — auto-picks up new commands at build

infra/
  Dockerfile                                 ← MODIFY: declare /app/crons mount point (the host bind is configured at runtime by the CLI start command — see Task list)
  entrypoint.sh                              ← KEEP unchanged
```

### Data flow — `zeno cron create send-hello --schedule '0 9 * * 1-5'`

```
host                                       worker (in container)
────────────────────────────────────────────────────────────────────
zeno cron create send-hello --schedule '0 9 * * 1-5'
   │
   ├─ resolveProfile() → "personal"
   ├─ validateSlug('send-hello')       OK (matches ^[a-z][a-z0-9-]*$)
   ├─ validateSchedule('0 9 * * 1-5')  OK (cron-parser)
   ├─ check folder absence: ~/.zeno/profiles/personal/crons/send-hello/  not present  → continue
   ├─ read template:    templates copy from <profileDir>/crons/_template/CRON.md
   ├─ substitute frontmatter:
   │     name:     "Send hello"  (titlecase of slug)
   │     schedule: "0 9 * * 1-5"
   │     enabled:  true
   ├─ mkdir -p   ~/.zeno/profiles/personal/crons/send-hello/
   ├─ write     ~/.zeno/profiles/personal/crons/send-hello/CRON.md (atomic: .tmp + rename)
   └─ print     "created · /Users/.../crons/send-hello/CRON.md"
                                                ┌──────────────────────────────────────────┐
                                                │ within 2 s: CronManager.reconcile()       │
                                                │ → fs.stat detects new folder              │
                                                │ → parse CRON.md                           │
                                                │ → INSERT crons row (id='send-hello', …)   │
                                                │ → schedule setTimeout(nextRun)            │
                                                └──────────────────────────────────────────┘
```

### Data flow — cron fire path

```
                                          worker (CronManager)
                                          ──────────────────────
setTimeout resolves at 09:00
   │
   ├─ run = AgentBackend.query(prompt, {
   │            cwd: '/app/crons/send-hello',
   │            systemPrompt: <buildCronSystemPrompt({slug, scheduledAt})>,
   │        })
   │
   ├─ INSERT cron_runs ({
   │         id: uuid,
   │         cronId: 'send-hello',
   │         startedAt, completedAt,
   │         status: run.error ? 'failed' : 'passed',
   │         sessionId: run.sessionId ?? null,
   │     })
   │
   ├─ UPDATE crons SET
   │         last_run_at = completedAt,
   │         next_run_at = nextFromSchedule(),
   │         updated_at  = now()
   │   WHERE id = 'send-hello'
   │
   └─ schedule next setTimeout
```

### Data flow — `zeno cron test send-hello`

```
host                                       worker (in container)
────────────────────────────────────────────────────────────────────
zeno cron test send-hello
   │
   ├─ POST http://127.0.0.1:<port>/api/crons/send-hello/test
   │     header X-Zeno-Origin: cli
   │
   │                                          ┌──────────────────────────────────────────┐
   │                                          │ blockIfCli middleware: header present → │
   │                                          │ allow.                                   │
   │                                          │                                          │
   │                                          │ cron-test-runner.runOnce(slug):          │
   │                                          │ 1. read CRON.md from /app/crons/<slug>/  │
   │                                          │ 2. parse frontmatter + body              │
   │                                          │ 3. AgentBackend.query(body, {cwd: …})    │
   │                                          │ 4. respond { sessionId, status,          │
   │                                          │              latencyMs, error? }         │
   │                                          └──────────────────────────────────────────┘
   │
   ←  200 { sessionId: 'sess_abc', status: 'passed', latencyMs: 1842 }
   │
   └─ print "send-hello · passed · session sess_abc · 1842 ms"
```

### Data flow — `zeno cron disable send-hello` (atomic frontmatter rewrite)

```
host
────────────────────────────────────────────────────
zeno cron disable send-hello
   │
   ├─ resolveProfile → "personal"
   ├─ path = ~/.zeno/profiles/personal/crons/send-hello/CRON.md
   ├─ read file → original bytes
   ├─ parse frontmatter (gray-matter) → data + content
   ├─ data.enabled = false
   ├─ serialize → newBytes
   ├─ write   path + '.tmp' (newBytes)
   ├─ fsync   path + '.tmp'
   ├─ rename  path + '.tmp' → path     (atomic on POSIX)
   └─ print   "disabled · send-hello"
                                       (within 2 s reconciler updates DB row, cancels timeout)
```

## Phase order

The phases below correspond 1:1 to the section headings in `tasks-crons-cli-first.md`. The order is:

1. **DB migration** (slim schema + `cron_runs.session_id`) — foundation.
2. **Profile templates** (`_README.md` + `_template/CRON.md` + profile-create wiring) — operator-visible bedrock; no runtime depends on it but every subsequent test needs the template files in place.
3. **Worker frontmatter parser** (`apps/worker/src/cron/frontmatter.ts`) — pure unit, no I/O coupling.
4. **CronManager** (poll, fire, reconcile) — the heart.
5. **Worker boot wiring** — replaces the legacy runner.
6. **API routes rewrite** (read-only + `POST /:slug/test`) — outside dependency on the manager + on `cron-test-runner`.
7. **CLI subtree** (8 verbs) — outside dependency on the API + the filesystem helpers.
8. **Dashboard rewrite** — outside dependency on the new API.
9. **apps/docs rewrite** — outside dependency on the CLI surface being final.
10. **Infra Dockerfile + container mount** — wires the host bind for `crons/` into the worker container.
11. **Manual E2E rehearsal** (real profile, real Slack channel + Linear connector for an end-to-end fire).
12. **Quality gate + PR**.

Phases 1–5 are sequential. Phases 6–9 can be partially parallel after Phase 5 lands but the task list treats them sequentially for reviewability. Phases 10–12 are sequential and final.

## Risks during execution

| Risk | Mitigation in plan |
|---|---|
| `gray-matter` not yet in `apps/worker/package.json` (only in `apps/docs/package.json`) | Phase 3 Task adds it as a dep with `pnpm add gray-matter -F @zeno/worker` and verifies the import in the unit test. |
| `cron-parser` not in tree | Check at start of Phase 3; add `pnpm add cron-parser -F @zeno/worker` and `pnpm add cron-parser -F @zeno/cli` (CLI validates schedule on create). |
| Container can't see crons folder on first run (forgot to bind mount) | Phase 10 explicitly wires the `crons/` bind into `apps/cli/src/commands/start.ts` and the worker entrypoint; Phase 11 verifies via `docker exec ls /app/crons`. |
| Migration runs but bootstrap fails to insert any row (no `_README.md` skipped properly) | Phase 3 reconciler test cases include `_README.md` + a `.disabled` folder + `_template/` — all must be skipped silently. |
| Atomic rename on Docker bind mounts (osxfs / virtiofs) failing | Phase 5/7 task notes — file rename within the same directory is atomic on every supported FS (POSIX guarantees + Docker passes through). Tested in Phase 11 E2E. |
| Existing operators have crons + run history they care about | The spec explicitly accepts the clean-slate decision (single-operator project, user confirmed). Release notes generated in Phase 12 PR body call this out for any future readers. |
| Dashboard build breaks because deleted hooks are still referenced from somewhere unexpected | Phase 8 Task includes a final `pnpm --filter @zeno/dashboard typecheck` step before commit; the type errors guide cleanup. |

## Self-Review summary

After drafting, the plan was checked against every section of `spec-crons-cli-first.md`:

- **A1 (filesystem-as-truth)** — Phase 4 (manager) + Phase 3 (frontmatter parser) implement it. ✅
- **A2 (file format)** — Phase 3 (frontmatter parser) validates name, schedule, enabled, body. ✅
- **A3 (folder layout + _README.md)** — Phase 2 (templates) + Phase 10 (Dockerfile mount). ✅
- **A4 (CronManager)** — Phase 4. ✅
- **A5 (CLI subtree)** — Phase 7. ✅
- **A6 (API routes)** — Phase 6. ✅
- **A7 (dashboard rewrite)** — Phase 8. ✅
- **A8 (docs)** — Phase 9. ✅
- **A9 (migration)** — Phase 1. ✅
- **Non-Goals** — legacy `cron_skills` / `cron_connectors` tables, repos, API routes left intact; Phase 8 only removes the dashboard surfaces consuming them. ✅
- **Acceptance criteria CLI/Worker/API/Dashboard/Templates/Docs/Migration** — Phase 11 (E2E) and Phase 12 (quality gate) drive each AC to a verified state. ✅

No placeholders, no spec gaps. Plan ready for execution via subagent-driven-development.
