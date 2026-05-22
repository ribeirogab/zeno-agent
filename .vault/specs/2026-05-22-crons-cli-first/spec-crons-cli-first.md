---
status: draft
feature: crons-cli-first
created: 2026-05-22
shipped: null
---
# Crons CLI-First Rework — Spec

**Status:** Draft
**Scope:** Move every cron mutation behind a new `zeno cron …` CLI subtree. Make the dashboard `/crons` page read-only and gated by `ZENO_API_WRITES`. Flip the source of truth for cron definitions from the runtime DB to the per-profile filesystem (`~/.zeno/profiles/<name>/crons/<slug>/CRON.md`). Replace the boot-time DB-scan cron runner with a `CronManager` that polls the filesystem and reconciles a slim DB cache (runtime state only).

## Context

This spec lands the third instance of the "CLI mutates · dashboard reads" model already proved out by:

- **Spec [connectors CLI-first design](../2026-05-08-connectors-cli-first-design/spec-connectors-cli-first-design.md) (PR #54)** — locked 100% CLI-only mutations + dashboard `<CommandModal>` pattern + `ZENO_API_WRITES` gate + `X-Zeno-Origin: cli` bypass.
- **Spec [backend CLI-only management](../2026-05-10-backend-cli-only/spec-backend-cli-only.md) (PR #56)** — same model applied to backends, **direct DB writes** instead of the connectors' async `commands` queue.
- **Spec [channels CLI-first](../2026-05-11-channels-cli-first/spec-channels-cli-first.md) (PR #57)** — same again for channels, plus the `ChannelManager` hot-reload pattern this spec mirrors for crons.

The CLI-only-mutations contract is now a constitutional rule — see [[../../rules/cli-only-mutations]] (added in PR #101). Crons are the next surface; this spec brings them under that rule and goes one step further: the source of truth for a cron's name, schedule, prompt and enabled flag moves from the DB to the filesystem (one folder per cron under `~/.zeno/profiles/<name>/crons/<slug>/`). The DB becomes a derived cache of runtime state (lastRunAt, nextRunAt, lastError, plus a content hash + mtime for poll dedup).

The shift to filesystem-as-truth is novel for Zeno but well-precedented in adjacent surfaces:

- Skills are SKILL.md files under `~/.claude/skills/<name>/` ([[../../specs/2026-05-08-skill-management|spec 0052]]).
- The per-profile knowledge folder is a markdown tree ([PR #100](https://github.com/ribeirogab/zeno-agent/pull/100)) with a `_README.md` operator overview.
- The `AGENTS.md` operating manual is a file, not a DB row.

Crons fit this pattern better than they fit the DB model: an operator authoring a cron is writing a prompt — a long markdown body that wants an editor, not a textarea. Aux scripts the prompt references want to live next to the prompt (`scripts/`), not in a separate location. Versioning a profile's crons in the operator's own git repo (out of scope for this spec but enabled by the design) becomes trivial.

## Problem Statement

1. **No first-class CLI lifecycle for crons.** Connectors, backends and channels each have a `zeno <noun> …` subtree; crons are the only configuration surface where the operator must go through the dashboard. There is no scriptable path for IaC-style provisioning, no `zeno cron test`, no command an agent could run to drop a cron.
2. **Dashboard `/crons` is the odd one out.** After PR #54 / #56 / #57 every other dashboard surface is read-only. `/crons` still hosts a CRUD form (`new-cron-modal`, `cron-form`, `schedule-picker`, `delete-cron-modal`) that bypasses the `ZENO_API_WRITES` gate and contradicts [[../../rules/cli-only-mutations]].
3. **Cron prompts live in a TEXT column.** Long markdown prompts edited through a `<textarea>` — no editor support, no version control, no comments-vs-prompt separation, no companion scripts. Operator UX is poor for the only field that actually matters.
4. **Skill/connector linking is a phantom feature.** The dashboard exposes `link-skill-picker-modal` and `link-connector-picker-modal` to attach skills or connectors to a cron, but the runtime never actually consumes those joins — `cron_skills` and `cron_connectors` rows exist as dead data. Removing the UI is the right call; ripping the tables out is a separate spec.
5. **DB-only crons can't be diff'd, audited or git-tracked.** An operator who wants a backup of their crons has no native path. The dashboard's only export is a screenshot.

## Non-Goals

- **Migration of existing DB-resident crons.** Per the explicit decision during brainstorming, this spec assumes no pre-existing crons. The migration drops every row in `crons` and `cron_runs` as a clean slate. Operators who had crons in the DB must recreate them as markdown files. The spec is acceptable only because the user is the sole operator and confirmed zero data loss is acceptable.
- **Removing `cron_skills` and `cron_connectors` tables, repos and API routes.** Per the explicit decision during brainstorming, the legacy linking surface stays intact at the DB, repo and route layers. Only the dashboard's read and write paths to those joins are removed. The cron runner does not consume the joins (it already did not). A future spec may rip them out entirely; this spec does not.
- **Notify config (`notifyConversationId` / `notifyThreadId`).** Per the explicit decision during brainstorming, output routing is removed from this spec entirely. Cron runs log to `cron_runs` and the agent backend's normal logging; there is no Slack channel or thread the cron writes back to. A future spec may reintroduce notify as a frontmatter field.
- **Editor integration.** The CLI does **not** launch `$EDITOR` for any verb. `zeno cron create` scaffolds a folder and prints the path; the operator opens the file in their own editor. `zeno cron open` opens the folder in the OS file browser (mirroring `zeno knowledge open`) — that is the only "editor" affordance.
- **Schedule presets (`@daily`, `@every 15m`).** Schedule is a raw cron expression only. The docs link to crontab.guru for validation help. A future spec may add presets if operator pain is real.
- **Filesystem watch (inotify / chokidar).** The reconciler polls `mtime` every 2 s. Filesystem watch on Docker bind mounts is unreliable across host operating systems; the 2 s lag mirrors `ChannelManager` and is acceptable.
- **Cross-profile crons.** Each profile has its own `crons/` folder. Profiles do not share scheduled work. This was already true; the spec does not change it.
- **Run output persistence beyond `cron_runs`.** Each fire produces a `cron_runs` row with a `session_id` (the agent session identifier returned by `AgentBackend.query()`); that session is the canonical record. No separate transcript file is written.

## Constraints

- **Stack locked by the constitution** — TypeScript strict, Node 24 LTS, pnpm + Turborepo, vitest, biome, pino, zod, citty for CLI, drizzle + better-sqlite3 for the runtime DB.
- **`ZENO_API_WRITES=cli` is the default.** Every cron mutation either operates on the filesystem (no HTTP) or hits an HTTP endpoint that requires `X-Zeno-Origin: cli`. The dashboard never sends that header.
- **DB is per-profile runtime SQLite at `<workspaceDir>/zeno.db`.** This spec slims the `crons` table and clears `cron_runs`. No new tables.
- **The crons folder is mounted read-only into the worker container.** Mirrors `knowledge/`. The worker never writes to the folder — that is the operator's domain via CLI or editor.
- **No new dependencies.** YAML frontmatter parsing uses an existing dep (gray-matter is already in the tree via knowledge-rendering; verify at implementation time). Cron expression parsing uses `cron-parser` if already present, otherwise the implementation step picks a vetted lib and documents the choice in `[[../../learnings/]]`.
- **Single-user single-profile.** No multi-tenant concerns.
- **Slug == folder name == DB row id.** The `crons.id` column's semantics change with this spec: it stops holding a UUID and starts holding the slug verbatim. This is structurally compatible with the existing PK type (`text`); no PK rename, no column add. The clean-slate migration (`DELETE FROM crons`) erases the only legacy data that would conflict. `cron_runs.cron_id` continues to reference `crons.id` (CASCADE) — the FK semantics are unchanged; only the value space (UUIDs → slugs) flips. Lowercase + kebab-case enforced by the CLI on create; the reconciler refuses to register folders whose name fails the regex. Reserved names: `_template`, `_README.md`, `.disabled`, `.tmp` (and any other leading-underscore or leading-dot entry).
- **API route param renamed `:id` → `:slug`.** The existing `apps/api/src/routes/crons.ts` uses `:id` in its handlers. As part of this rewrite the param name becomes `:slug` everywhere, matching the new identifier semantics. CLI clients always pass slugs; nothing in the codebase relies on the old name post-migration.
- **YAML parsing library.** `gray-matter` is present today only in `apps/docs/package.json` (the docs renderer). The worker package needs a frontmatter parser; implementation picks either adding `gray-matter` to `apps/worker/package.json` or a vetted minimal alternative. Decision recorded as an atomic note in `[[../../learnings/]]` at implementation time. Not a blocker for this spec.

## Approach

### A1 — Source of truth: filesystem; DB is a derived cache

**Decision: filesystem-as-truth.** The folder `~/.zeno/profiles/<name>/crons/<slug>/CRON.md` is the authoritative definition of a cron. The DB stores only runtime state plus a small cache so the dashboard can render a list without re-opening every file per request.

**Reasoning.** A cron's primary content is a long markdown prompt. Markdown wants an editor and a file. Aux scripts the prompt references want to live next to it (`crons/<slug>/scripts/`). Operators who want to version their crons can `cd ~/.zeno/profiles/<name>/crons && git init` and that works. The DB cannot offer any of this. The cost is one reconciler component and a 2 s mtime poll; that cost is paid once and amortized across every cron.

**Trade-off.** Diverges from connectors / channels / backend, which keep the source of truth in the DB. Acceptable — domain semantics differ. Connectors/backends are configuration; crons are content. The dashboard mode gate (`ZENO_API_WRITES=cli`) and the `<CommandModal>` UX stay identical to the established pattern.

### A2 — File format: rich YAML frontmatter + body == prompt

`CRON.md` shape:

```markdown
---
name: Send hello              # required, human-readable
description: Daily greeting   # optional
schedule: 0 9 * * 1-5         # required, cron expression (UTC)
enabled: true                 # required boolean
---
Replace this body with the prompt the agent should run on the schedule above.
You can reference files via Bash (your working dir is /app/crons/<slug>/),
e.g. `cat scripts/payload.json`.
```

**Validation** (performed by the reconciler on every parse):

- `name`: non-empty string.
- `description`: optional string.
- `schedule`: parsed via `cron-parser`; invalid → cron registered with `lastError = 'invalid_schedule: <message>'` and `enabled` internally forced to `false` regardless of frontmatter.
- `enabled`: strict boolean. Anything else (string `"true"`, integer `1`) → `lastError = 'invalid_enabled_flag'`, cron not fired.
- Body: at least one non-blank line. Empty body → `lastError = 'empty_prompt'`, cron not fired.

**Slug rules** (enforced by CLI on create and by reconciler at parse time):

- Lowercase + kebab-case: `^[a-z][a-z0-9-]*$`.
- Length 1..63.
- Reserved: any name starting with `_` or `.`. The reconciler skips these silently — they are operator-meta entries (`_README.md`, `_template/`).

**Aux files** (`crons/<slug>/scripts/`): no rules. The agent reads them at runtime via `Bash` (`cat /app/crons/<slug>/scripts/payload.json`). The system prompt for a cron run injects the working directory path.

### A3 — Folder layout + `_README.md` operator overview

```
~/.zeno/profiles/<name>/crons/
├── _README.md                # how-it-works overview (operator-facing)
├── _template/                # blank scaffold; `zeno cron create` copies CRON.md from here
│   └── CRON.md
├── send-hello/               # operator-created
│   ├── CRON.md
│   └── scripts/              # optional
└── daily-standup/
    └── CRON.md
```

Two files land in `templates/profile/crons/` so `zeno profile create` scaffolds them on every new profile:

- `templates/profile/crons/_README.md` — content drafted in this spec's design phase; mirrors `templates/profile/knowledge/_README.md` ([PR #100](https://github.com/ribeirogab/zeno-agent/pull/100)). Contents (verbatim):
  - Frontmatter (`title`, `tags: [meta, reference]`).
  - Heading + one-paragraph orientation.
  - Pointer to `https://docs.zeno-agent.dev/docs/crons`.
  - Layout block (the tree above).
  - How the worker uses it (mount, poll, fire).
  - CRON.md frontmatter table.
  - CLI command reference.
  - Privacy note.
- `templates/profile/crons/_template/CRON.md` — blank scaffold with `enabled: false` and an inline-comment prompt body. `zeno cron create <slug>` copies this file (substituting the slug-derived `name` and the operator-supplied `--schedule` value) into `crons/<slug>/CRON.md`.

The container mount path is `/app/crons`, read-only, bind from `~/.zeno/profiles/<name>/crons/`. Mirrors the knowledge mount.

### A4 — `CronManager`: poll-based reconciler

New module [`apps/worker/src/cron/manager.ts`](../../../apps/worker/src/cron/manager.ts). Replaces the current DB-scan runner at [`apps/worker/src/cron/runner.ts`](../../../apps/worker/src/cron/runner.ts) (the existing `parser.ts`, `tools.ts` and `zeno-context-block.ts` are kept; only the runner module is rewritten).

**Lifecycle**:

1. **Boot.** `CronManager.start()` walks `/app/crons/*/CRON.md`, parses each file, runs validation, upserts a `crons` row per file, schedules a `setTimeout` for each enabled cron's next fire.
2. **Poll loop every 2 s.** For each `crons` row + folder pair:
   - Folder missing → DELETE row (CASCADE clears `cron_runs`), cancel timeout.
   - `stat.mtimeMs > row.mtime_ms` OR `sha256(file) !== row.content_hash` → re-parse, UPDATE row, cancel + re-schedule timeout.
   - Else → skip (fast path; the common case).
3. **Fire.** When `setTimeout` resolves: agent backend `query(prompt, { cwd: '/app/crons/<slug>' })` returns an `AgentOutput { text, toolCalls, sessionId? }` — the existing interface in [`apps/worker/src/agent/types.ts`](../../../apps/worker/src/agent/types.ts). The reconciler inserts a `cron_runs` row with the returned `sessionId` (the agent session identifier; this spec adds a `session_id` column to `cron_runs` — see A9), UPDATE `crons.last_run_at`, recompute `next_run_at` from the cron expression, schedule the next timeout. `crons.updated_at` is updated on every row write (insert and reconcile-update) so the dashboard list can order by recency.
4. **SIGTERM.** `CronManager.stop()` cancels every pending timeout. In-flight agent runs are not aborted (let them finish; the agent backend handles its own shutdown).

**Reconciliation matrix:**

| Filesystem state | DB state | Action |
|---|---|---|
| Folder + valid CRON.md exists | no row | INSERT row, schedule if `enabled` |
| Folder exists, mtime advanced or hash changed | row exists | re-parse, UPDATE row, cancel + reschedule timeout |
| Folder exists, mtime + hash unchanged | row exists | skip (fast path) |
| Folder exists, CRON.md invalid | row exists | UPDATE row with `lastError`, internal `enabled=0`, cancel timeout |
| Folder gone | row exists | DELETE row (CASCADE clears `cron_runs`), cancel timeout |
| Frontmatter `enabled: false` | row exists | UPDATE row, cancel timeout (history kept) |
| Frontmatter `enabled: true` after `false` | row exists | schedule timeout |
| Reserved name (`_*`, `.*`) | n/a | skip silently |

**Concurrency guard.** In-process `isReconciling` boolean (mirrors `ChannelManager`). Missed ticks recoverable on next tick. The worker process is a singleton per profile; cross-process races do not apply.

**Hashing.** `content_hash = sha256(fs.readFileSync(path))`. Cheap on small files; defensive against tools that touch mtime without changing content.

### A5 — CLI subtree: `zeno cron`

New file tree under [`apps/cli/src/commands/`](../../../apps/cli/src/commands/):

```
cron.ts                        // umbrella defineCommand
cron-list.ts
cron-show.ts
cron-create.ts
cron-open.ts
cron-enable.ts
cron-disable.ts
cron-delete.ts
cron-test.ts
```

Citty pattern matches `connector-*.ts`, `backend-*.ts`, `channel-*.ts`. Profile resolution: explicit `--profile` → sticky → picker (TTY) → exit 1 (non-TTY). Every read command accepts `--json`; every command accepts `--quiet`; destructive commands (`delete`) require `--yes` in non-TTY.

**Verb semantics:**

| Verb | Wire | Behavior |
|---|---|---|
| `list` | filesystem walk + `GET /api/crons` | Joins folder entries with DB-cached runtime state (lastRunAt, nextRunAt, lastError). Table: slug, name, schedule, enabled, last run, next run. `--json` emits `CronListItem[]`. |
| `show <slug>` | filesystem read | Prints parsed frontmatter + body. `--json` emits `{ name, description, schedule, enabled, body, lastRunAt, nextRunAt, lastError }`. |
| `create <slug>` | filesystem write | Required: `--schedule '<expr>'`. Optional: `--name '<text>'` (default: titlecase of slug), `--description '<text>'`. Validates slug pattern. Refuses if folder exists. Copies `_template/CRON.md`, substitutes frontmatter fields, writes to `crons/<slug>/CRON.md`. `enabled: true` by default. Prints absolute path. **Does not launch an editor.** |
| `open [slug]` | OS process | No slug → opens `crons/` folder in the OS file browser. With slug → opens `crons/<slug>/`. Mirrors `zeno knowledge open`. |
| `enable <slug>` | filesystem rewrite | Atomic frontmatter edit: parse YAML → set `enabled: true` → serialize → write sibling `crons/<slug>/CRON.md.tmp` → rename over `crons/<slug>/CRON.md`. Body bytes untouched. |
| `disable <slug>` | filesystem rewrite | Same, `enabled: false`. |
| `delete <slug> [--yes]` | filesystem `rm -rf` | TTY prompt `delete cron '<slug>'? this removes the folder and run history. (y/N)`. `--yes` skips. Non-TTY without `--yes` exits 1 with `destructive operation requires --yes in non-interactive mode`. Removes the folder; reconciler picks up and clears the DB row + cron_runs on the next tick. |
| `test <slug>` | `POST /api/crons/:slug/test` with `X-Zeno-Origin: cli` | Synchronous run. Worker fires the cron immediately, blocks until the agent run reports a session id (≤ 5 s), returns `{ sessionId, status, latencyMs, error? }`. CLI prints `<slug> · passed · session <id> · <ms>` (or `session —` when `sessionId` is null) or surfaces the error. |

**Single-cron picker.** `zeno cron show` with no positional in TTY opens a picker over existing folders; in non-TTY exits 1 with `usage: zeno cron show <slug>`. Same UX for `enable`, `disable`, `delete`, `test`, `open`.

**JSON schemas.** Add `CronListItem`, `CronShowJson`, `CronTestJson` to [`apps/cli/src/types/json-output.ts`](../../../apps/cli/src/types/json-output.ts). Per-command shapes, no envelope, no version field — matches connectors / channels / backends.

### A6 — Worker API routes

The file [`apps/api/src/routes/crons.ts`](../../../apps/api/src/routes/crons.ts) is rewritten. The full surface after this spec lands:

| Route | Source | Gate | Status code |
|---|---|---|---|
| `GET /api/crons` | rewritten | none | 200 list (slim cache) |
| `GET /api/crons/next` | rewritten (route retained, handler updated for new schema) | none | 200 — returns the next cron about to fire. The home page widget `next-cron-item.tsx` continues to consume this route. **Response shape change**: the previous handler returned `notifyConversationId`; this field is dropped along with the underlying column (see A9), so the response object loses that key. The `NextCron` interface in [`apps/dashboard/src/lib/use-next-crons.ts`](../../../apps/dashboard/src/lib/use-next-crons.ts) and the `NextCronModel` interface in [`apps/dashboard/src/routes/_authed/index.tsx`](../../../apps/dashboard/src/routes/_authed/index.tsx) lose the corresponding field. Neither type's consumer renders the field today, but the TypeScript types must be updated as part of A7. |
| `GET /api/crons/:slug` | rewritten | none | 200 detail (slim cache) |
| `GET /api/crons/:slug/source` | **new** | none | 200 `{ frontmatter, body }` — reads filesystem at request time |
| `POST /api/crons/:slug/test` | **new** | gated (`ZENO_API_WRITES=cli` requires `X-Zeno-Origin: cli`) | 200 `{ sessionId, status, latencyMs, error? }` — `sessionId` is the agent session id returned by `AgentBackend.query()`; nullable when the run failed before producing one |
| `POST /api/crons` | removed | n/a | route deleted; clients hit a generic 404 |
| `PATCH /api/crons/:slug` | removed | n/a | 404 |
| `DELETE /api/crons/:slug` | removed | n/a | 404 |
| `POST /api/crons/:slug/pause` | removed | n/a | 404 |
| `POST /api/crons/:slug/resume` | removed | n/a | 404 |
| `POST /api/crons/:slug/run-now` | removed | n/a | 404 (functionality subsumed by `POST /api/crons/:slug/test`) |

**Gate semantics.** The `test` route is gated because the run has side effects (`cron_runs` row, agent invocation, downstream connector calls). The dashboard never calls it; the chip opens a `<CommandModal>` with `zeno cron test <slug>` and the operator runs the command.

**Legacy join routes (`cron-connectors.ts`, `cron-skills.ts`)** stay registered, are not exercised by the runtime, and are dropped from the dashboard. A future spec removes them.

**Status codes.** Reads return 200; the test endpoint returns 200 with a body. There are no other mutation endpoints — the filesystem is the mutation surface.

**Shared middleware.** Reuses the same `blockIfCli` factory introduced for connectors and channels.

### A7 — Dashboard `/crons` rewrite

`apps/dashboard/src/routes/_authed/crons.index.tsx` and `apps/dashboard/src/routes/_authed/crons.$id.tsx` are rewritten for the read-only flow.

**Index `/crons`**:

- Reads `GET /api/mode` once at load. With `ZENO_API_WRITES=cli` (default), renders no submit buttons.
- Reads `GET /api/crons` → list of slim rows.
- Table columns: name, schedule, enabled (status pill), lastRunAt, nextRunAt, lastError badge (if present).
- Per-row chips: `[OPEN]` `[ENABLE]` / `[DISABLE]` `[TEST]` `[DELETE]` → `<CommandModal>` with the corresponding `zeno cron …` command pre-filled (slug pre-substituted).
- Header chip `[NEW CRON]` → `<CommandModal>` with `zeno cron create <slug> --schedule '<expr>'` (placeholders preserved; operator fills the values in their terminal).
- Footer: `crons folder · ~/.zeno/profiles/<name>/crons · <N> entries`. Count comes from the API response.
- Empty state (no rows): instructional card with `zeno cron create example --schedule '0 9 * * *'` as a copyable command.

**Detail `/crons/:slug`**:

- Reads `GET /api/crons/:slug` (slim cache) + `GET /api/crons/:slug/source` (raw frontmatter + body, fetched at request time).
- Properties block: frontmatter rendered as key/value pairs.
- Body: markdown rendered (same renderer the `/knowledge` page uses).
- Run history table: existing `cron_runs` data.
- Chips: `[OPEN FOLDER]` `[ENABLE]` / `[DISABLE]` `[TEST]` `[DELETE]` → `<CommandModal>`.
- Banner: if `lastError` non-null, red banner from the standard design system surfacing the error string. No retry button — the operator fixes the file and the reconciler picks up.

**Components removed** (deleted from disk):

- `apps/dashboard/src/components/modals/new-cron-modal.tsx`
- `apps/dashboard/src/components/modals/delete-cron-modal.tsx`
- `apps/dashboard/src/components/crons/cron-form.tsx`
- `apps/dashboard/src/components/crons/cron-row-actions.tsx` (currently imports `usePauseCron`, `useResumeCron`, `useRunNowCron`, `useDeleteCron` — all hooks target routes this spec removes; replaced by the `<CommandModal>`-triggering `cron-actions.tsx`)
- `apps/dashboard/src/components/crons/schedule-picker.tsx`
- `apps/dashboard/src/components/crons/link-skill-picker-modal.tsx`
- `apps/dashboard/src/components/crons/link-connector-picker-modal.tsx`
- `apps/dashboard/src/components/crons/linked-skills-section.tsx`
- `apps/dashboard/src/components/crons/linked-connectors-section.tsx`
- Hooks: `apps/dashboard/src/lib/use-cron-skills.ts`, `apps/dashboard/src/lib/use-cron-connectors.ts`, `apps/dashboard/src/lib/cron-schedule.ts`, plus the mutation hooks consumed only by `cron-row-actions.tsx` (`usePauseCron`, `useResumeCron`, `useRunNowCron`, `useDeleteCron` — exact file paths confirmed at implementation time).

**Components kept (and refactored)**:

- `apps/dashboard/src/components/crons/cron-row.tsx` — read-only mode.
- `apps/dashboard/src/components/crons/cron-status-pill.tsx` — unchanged.
- `apps/dashboard/src/components/crons/cron-run-history-row.tsx` — unchanged.
- `apps/dashboard/src/components/crons/cron-actions.tsx` — refactored to render `<CommandModal>` triggers (replaces `cron-row-actions.tsx`).
- `apps/dashboard/src/components/skeletons/crons-table-skeleton.tsx`, `apps/dashboard/src/components/skeletons/cron-detail-runs-skeleton.tsx` — unchanged.

The home page widget `next-cron-item.tsx` stays as a read-only row reading from the same slim cache. Its hook `use-next-crons.ts` and the consuming `NextCronModel` interface on the home route both lose the `notifyConversationId` field (dropped along with the column — see A6 row for `GET /api/crons/next` and A9). No visible render changes.

### A8 — `apps/docs` updates

Two files change:

- `apps/docs/content/docs/crons.mdx` — **full rewrite**. The current page documents the now-deleted dashboard-CRUD flow and explicitly says "the CLI does not expose cron CRUD" — that statement inverts. New page covers:
  - What a cron is (one folder under `crons/`, one CRON.md per cron, one fire per scheduled tick).
  - Folder layout (the tree from `_README.md`).
  - CRON.md frontmatter (the validation table).
  - Lifecycle (`create` → edit file → `test` → reconciler picks up).
  - CLI reference (auto-generated flag tables via `@/generated/cli-flags/cron-*.mdx`).
  - Dashboard behavior (read-only; chips open `<CommandModal>`).
  - Persistence (filesystem under `~/.zeno/profiles/<name>/crons/`; not committed to the Zeno repo).
  - What crons are not (not skills, not background workers, not in the runtime DB anymore beyond the cache).
- `apps/docs/content/docs/cli.mdx` — new `Crons` section with one subsection per verb. Flag tables import from `@/generated/cli-flags/cron-*.mdx`; the existing `scripts/generate-cli-flag-tables.ts` picks up the new commands automatically.

The docs E2E rehearsal step (already in the pipeline per the channels and connectors specs) runs every example command in the new pages against a live CLI before the docs PR merges.

### A9 — DB schema migration

A new drizzle migration `packages/db/src/runtime/migrations/NNNN_crons_filesystem_truth.sql` (number assigned at implementation time):

```sql
-- Clean slate: drop every existing cron row (per spec decision).
DELETE FROM cron_runs;
DELETE FROM crons;

-- Drop columns on `crons` whose source of truth moved to the filesystem.
ALTER TABLE crons DROP COLUMN prompt;
ALTER TABLE crons DROP COLUMN source;
ALTER TABLE crons DROP COLUMN created_by;
ALTER TABLE crons DROP COLUMN notify_conversation_id;
ALTER TABLE crons DROP COLUMN notify_thread_id;
ALTER TABLE crons DROP COLUMN created_at;

-- Add columns on `crons` for the reconciler's fast-path and error surface.
ALTER TABLE crons ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE crons ADD COLUMN mtime_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crons ADD COLUMN last_error TEXT;
ALTER TABLE crons ADD COLUMN last_error_at TEXT;

-- Add column on `cron_runs` to record the agent session id returned by
-- AgentBackend.query() (used by the test endpoint and the run history).
ALTER TABLE cron_runs ADD COLUMN session_id TEXT;
```

**`crons.id` semantics**: the column type stays `text`, but its value space changes from UUIDs to slugs. The clean-slate `DELETE FROM crons` ensures no value collision; every new row inserted by the reconciler uses the slug as the `id`. `crons.updated_at` (already present) is kept and updated on every row write (insert and reconcile-update). The dashboard list orders by `updated_at` desc.

**`cron_runs.session_id`**: nullable text. Populated by both the fire path (`CronManager`) and the test endpoint with the value returned by `AgentBackend.query()`. Nullable because a run that errors before the agent produces a session has nothing to record. The dashboard run-history table renders the session id (truncated, copy-on-click).

SQLite ≥ 3.35 supports `DROP COLUMN`; better-sqlite3 ships ≥ 3.45. Verified at implementation time.

**Tables untouched**: `cron_skills`, `cron_connectors`, plus their indexes and FKs. Per Non-Goals.

Schema definition in [`packages/db/src/runtime/schema.ts`](../../../packages/db/src/runtime/schema.ts) updates to match the new column set on both `crons` and `cron_runs`.

## User Stories / Scenarios

### S1 — First-time cron on a clean profile

1. Operator runs `zeno cron create send-hello --schedule '0 9 * * 1-5' --name "Daily hello"`.
2. CLI validates the slug + schedule, scaffolds `~/.zeno/profiles/<name>/crons/send-hello/CRON.md` from `_template/CRON.md`, substitutes `name`, `schedule` and flips `enabled: true`. Prints the path.
3. Operator opens the file in their editor, writes the prompt, saves.
4. Within 2 s the `CronManager` poll picks up the new file, parses, INSERTs a `crons` row, schedules the next fire.
5. Operator runs `zeno cron test send-hello` immediately to verify; CLI prints `send-hello · passed · session sess_abc123 · 1842 ms`.
6. At 09:00 next weekday the cron fires; a `cron_runs` row is written with `session_id`, the dashboard's `/crons` page shows the run in the history table.

### S2 — Editing an existing cron

1. Operator opens `~/.zeno/profiles/<name>/crons/send-hello/CRON.md`, changes the schedule to `0 10 * * 1-5`, saves.
2. Within 2 s the reconciler detects the mtime/hash advance, re-parses, UPDATEs the row, cancels the old `setTimeout`, schedules the new one.
3. No CLI command was run. The operator may run `zeno cron show send-hello --json` to confirm the new `nextRunAt`.

### S3 — Disabling a cron temporarily

1. Operator runs `zeno cron disable send-hello`.
2. CLI atomically rewrites the frontmatter `enabled: false` (read → patch YAML → write to `.tmp` → rename). Body untouched.
3. Reconciler picks up within 2 s, cancels the timeout, UPDATEs the row. Run history stays.
4. Dashboard `/crons` shows the row with the `OFF` status pill.
5. Operator runs `zeno cron enable send-hello` later; reverse path.

### S4 — Read-only dashboard rejects a mutation attempt

1. Dashboard mounted in `ZENO_API_WRITES=cli` mode.
2. Operator clicks the `[DELETE]` chip on the `send-hello` row → `<CommandModal>` opens (destructive variant, red border) showing `zeno cron delete send-hello --yes`.
3. No submit button. Clicking `Copy` puts the command on the clipboard.
4. If a stale dashboard build still ships the old form, `DELETE /api/crons/send-hello` returns 404 — the route has been removed entirely, not gated.

### S5 — A CRON.md with an invalid schedule

1. Operator writes `schedule: 0 9 * * abc` and saves.
2. Reconciler parses, `cron-parser` rejects, `lastError = 'invalid_schedule: ...'`, internal `enabled=0`, no timeout scheduled.
3. Dashboard `/crons/send-hello` shows the red banner with the parse error string.
4. Operator fixes the file. Within 2 s the reconciler retries the parse, clears `lastError`, reschedules. No CLI command was needed.

### S6 — Operator wants to back up their crons under git

1. Operator: `cd ~/.zeno/profiles/<name>/crons && git init && git add . && git commit -m "initial"`.
2. Done. The folder is a normal directory of markdown files; standard git workflows apply.
3. Not in this spec's acceptance criteria but enabled by the design.

## Acceptance Criteria

### CLI

- [ ] `zeno cron create send-hello --schedule '0 9 * * 1-5'` scaffolds `crons/send-hello/CRON.md` from `_template/CRON.md` with `name: "Send hello"`, `schedule: "0 9 * * 1-5"`, `enabled: true`. Exits 0, prints the absolute path.
- [ ] `zeno cron create SendHello --schedule '0 9 * * 1-5'` exits 1 with `error: slug must match ^[a-z][a-z0-9-]*$`.
- [ ] `zeno cron create send-hello --schedule 'invalid'` exits 1 with `error: invalid cron expression: <message>`. No folder is created.
- [ ] `zeno cron create send-hello --schedule '0 9 * * 1-5'` twice exits 1 on the second run with `error: cron already exists at <path>`.
- [ ] `zeno cron list` TTY emits a table with the columns from A5; `--json` emits an array matching the exported `CronListItem` type.
- [ ] `zeno cron show send-hello` prints parsed frontmatter (as a key/value block) followed by the raw markdown body. `--json` emits `CronShowJson`.
- [ ] `zeno cron show` with no positional in TTY opens a picker over existing folders; in non-TTY exits 1 with `usage: zeno cron show <slug>`.
- [ ] `zeno cron enable send-hello` flips frontmatter `enabled: true` via tmp-file + rename; the body bytes are unchanged (verified by hashing body content before/after).
- [ ] `zeno cron disable send-hello` flips `enabled: false`; same atomicity guarantee.
- [ ] `zeno cron delete send-hello` in TTY prompts `delete cron 'send-hello'? this removes the folder and run history. (y/N)`; `n` exits 0 without filesystem changes.
- [ ] `zeno cron delete send-hello` non-TTY without `--yes` exits 1 with `error: destructive operation requires --yes in non-interactive mode`.
- [ ] `zeno cron delete send-hello --yes` removes the folder. The reconciler clears the DB row + cron_runs (CASCADE) within 4 s.
- [ ] `zeno cron test send-hello` posts to `/api/crons/send-hello/test` with `X-Zeno-Origin: cli`, blocks ≤ 5 s, prints `send-hello · passed · session <id> · <ms>` and exits 0. When the agent returns no session id, the line reads `send-hello · passed · session — · <ms>`.
- [ ] `zeno cron test missing-slug` exits 1 with `error: cron not found: missing-slug`.
- [ ] `zeno cron open` no slug opens `~/.zeno/profiles/<name>/crons/` in the OS file browser.
- [ ] `zeno cron open send-hello` opens `~/.zeno/profiles/<name>/crons/send-hello/`.
- [ ] Every subcommand accepts `--quiet` (no spinners, no headers, no ANSI escape sequences).
- [ ] Every subcommand resolves the profile via the same chain as channels (`--profile` → sticky → picker (TTY) → exit 1 (non-TTY)).

### Worker / CronManager

- [ ] Boot with three valid `CRON.md` files: three `crons` rows inserted, three `cron_scheduled` log entries, three `setTimeout` registrations. Idle for 10 s emits zero re-schedule logs.
- [ ] Edit `CRON.md` to change `schedule`: within ≤ 4 s the row is updated, the old timeout cancelled, the new one scheduled. Exactly one `cron_rescheduled` log entry fires.
- [ ] Delete the folder `crons/send-hello/`: within ≤ 4 s the row is deleted, the timeout cancelled, every `cron_runs` row with that `cronId` is removed (verified by `SELECT count(*) FROM cron_runs WHERE cron_id = ?` returning 0).
- [ ] `CRON.md` with invalid YAML: row gets `lastError = 'invalid_yaml: ...'`, `lastErrorAt` set, no timeout scheduled. Frontmatter `enabled: true` is ignored.
- [ ] `CRON.md` with invalid `schedule` field: `lastError = 'invalid_schedule: ...'`, no timeout.
- [ ] `CRON.md` with `enabled: false`: row inserted, no timeout. Flipping to `true` schedules within one poll tick.
- [ ] Fire path: when a `setTimeout` resolves, the agent backend is invoked with the parsed body as the prompt and `/app/crons/<slug>` as the working directory; on completion a `cron_runs` row is inserted with `session_id = AgentOutput.sessionId ?? null` and a `status` derived from whether the call threw, `crons.last_run_at` is updated, `next_run_at` is recomputed and the next timeout scheduled. `crons.updated_at` is also updated on every row write.
- [ ] SIGTERM cancels every pending timeout before the process exits (verified by exactly one `cron_manager_stopped` log entry and zero stray `cron_fired` entries after the signal).
- [ ] Concurrent reconcile: two manually injected back-to-back poll triggers fire `reconcile()` exactly once (verified by an in-process counter).
- [ ] Files starting with `_` or `.` are skipped silently (no row, no log warning).

### API

- [ ] `GET /api/crons` returns an array of slim rows (`{ slug, name, description, schedule, enabled, lastRunAt, nextRunAt, lastError, lastErrorAt }`).
- [ ] `GET /api/crons/send-hello` returns the slim row for that slug.
- [ ] `GET /api/crons/send-hello/source` returns `{ frontmatter: {...}, body: '...' }` read from the filesystem at request time (no cache).
- [ ] `POST /api/crons/send-hello/test` without `X-Zeno-Origin: cli` in mode `cli` returns `403 { error: 'mode_cli_only', action: 'test', cli: 'zeno cron test send-hello' }`.
- [ ] `POST /api/crons/send-hello/test` with the header and a valid slug returns `200 { sessionId, status, latencyMs }` within ≤ 5 s; on timeout it returns `200 { sessionId: null, status: 'failed', latencyMs: <elapsed>, error: 'timeout' }` rather than hanging. `sessionId` may be `null` on `passed` if the backend did not produce one.
- [ ] `POST /api/crons`, `PATCH /api/crons/:slug`, `DELETE /api/crons/:slug`, `POST /api/crons/:slug/pause`, `POST /api/crons/:slug/resume`, `POST /api/crons/:slug/run-now` all return 404 — the routes are removed from the file.

### Dashboard

- [ ] `/crons` in mode `cli` renders no submit buttons; every action chip opens `<CommandModal>` with the corresponding command string.
- [ ] `/crons/:slug` renders the frontmatter as a Properties block, the body as rendered markdown, and the run history table (existing `cron_runs` data).
- [ ] `linked-skills-section.tsx`, `linked-connectors-section.tsx`, `link-skill-picker-modal.tsx`, `link-connector-picker-modal.tsx`, `cron-form.tsx`, `cron-row-actions.tsx`, `schedule-picker.tsx`, `new-cron-modal.tsx`, `delete-cron-modal.tsx`, `use-cron-skills.ts`, `use-cron-connectors.ts`, `cron-schedule.ts`, plus the now-orphan mutation hooks (`usePauseCron`, `useResumeCron`, `useRunNowCron`, `useDeleteCron`) are deleted from disk (verified by `git status`).
- [ ] The empty state of `/crons` shows a copyable `zeno cron create example --schedule '0 9 * * *'` command.
- [ ] The footer of `/crons` reads `crons folder · <profile crons path> · <N> entries`; the count comes from the API.

### Templates

- [ ] `templates/profile/crons/_README.md` exists and is copied by `zeno profile create` into every new profile's `crons/` folder.
- [ ] `templates/profile/crons/_template/CRON.md` exists with `enabled: false` and an inline-comment prompt body.
- [ ] On a fresh profile (`zeno profile create foo`), the resulting `~/.zeno/profiles/foo/crons/` contains `_README.md` and `_template/CRON.md` and nothing else.

### Docs

- [ ] `apps/docs/content/docs/crons.mdx` is rewritten per A8.
- [ ] `apps/docs/content/docs/cli.mdx` gains a `Crons` section with one subsection per verb; flag tables import from `@/generated/cli-flags/cron-*.mdx`.
- [ ] Every example command in the new doc pages runs against a live CLI without error during the docs E2E rehearsal.

### Migration

- [ ] The new drizzle migration drops every row in `crons` and `cron_runs`, removes the listed columns from `crons`, adds `content_hash`, `mtime_ms`, `last_error`, `last_error_at` to `crons`, and adds nullable `session_id` to `cron_runs`.
- [ ] `cron_skills` and `cron_connectors` tables, indexes and FKs are untouched (verified by schema diff).
- [ ] On a fresh profile, after starting the worker, the migration applies, the `CronManager` boots, and `zeno cron list` returns an empty array.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| 2 s poll lag feels sluggish when the operator just saved a file. | CLI `enable`, `disable`, `delete` are filesystem ops with no immediate feedback expectation; `test` is the synchronous probe and gives an immediate result. The dashboard polls the API so it lags at most ~2 s behind the reconciler — acceptable for a single-user product. |
| `cron-parser` invalid-expression error messages are obscure. | The reconciler wraps every parse in a try/catch and stores the full error message in `lastError`. The dashboard renders it verbatim. The docs link to crontab.guru. |
| Operator deletes `_template/` or `_README.md` by accident. | Reconciler skips everything starting with `_` or `.`, so deletion does not create stray rows. `zeno profile create` re-scaffolds on the next profile (not the current one); if the operator deletes them in an active profile, the docs explain how to copy them back from the repo's `templates/profile/crons/`. |
| File-not-found races between poll tick and `delete` command. | The reconciler's per-tick walk handles the file-gone case explicitly (it deletes the row + cron_runs). No retry needed; the next tick converges. |
| Atomic frontmatter rewrite (`enable`/`disable`) fails mid-write. | Tmp-file + rename pattern is atomic at the filesystem level on every Unix; on Windows we are not supported. The reconciler validates and rolls back the in-memory state if the tmp file is corrupt. |
| Existing operators lose all their crons on upgrade. | Migration drops every row by design. Release notes explicitly document this; the operator (single user; this is a personal-agent project) confirmed acceptance of data loss during brainstorming. |
| Container can't see the crons folder. | Same bind-mount pattern already used for `knowledge/` and `AGENTS.md`. Smoke test in the docs E2E rehearsal includes a fresh `zeno start <profile>` followed by `zeno cron create`. |
| Cron fires while the file is being edited (mid-save). | Reconciler uses content hash + mtime as the change signal; a half-written file may fail parse and produce a `lastError` row briefly, but the next tick re-parses the now-complete file and clears the error. Net result: one transient red banner in the dashboard, no fire from the corrupt content. |
| Legacy `cron_skills` / `cron_connectors` rows accumulate but no path to use them. | Documented in Non-Goals; explicit follow-up spec to remove them. The current state is "dead data, no cost." |

## Open Questions

None. Every architectural decision listed in the design summary was resolved during brainstorming. Implementation-time choices (cron-parser library, gray-matter vs alternative, exact migration file number) are non-blocking and captured at implementation start.
