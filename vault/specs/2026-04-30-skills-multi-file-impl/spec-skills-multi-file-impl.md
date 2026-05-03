---
status: shipped
feature: skills-multi-file
created: 2026-04-30
shipped: 2026-04-30
---
# Spec 0062 — Skills multi-file infrastructure (implementation)

**Status:** Shipped (2026-04-30, PR #26)
**Scope:** Extend spec 0052 single-`SKILL.md` skills to **arbitrary file trees** (SKILL.md + supporting refs / scripts / examples / images). Storage shape: **DB metadata only, content lives on disk**. Materializer becomes symlink-based. Unblocks spec 0063 (auto-install Anthropic skill-creator). **Depends on spec 0061 (Paper artboards)** — implementation does not start until owner approves the artboards.

## Context

Spec 0052 reintroduced skills as DB-managed playbooks: each skill = one `SKILL.md` file, body stored in `skills.body TEXT`. Spec 0053 added the `source` enum (`zeno_default | profile | dashboard`) so skills can ship with the binary, with a profile, or be uploaded by the operator. Spec 0060 fixed the SDK option shape so the auto-discovery actually works at runtime.

Real-world skills aren't single files. Anthropic's reference catalog (skills.sh, including the `skill-creator` we want to install in spec 0063) is built on a multi-file convention: every skill is a directory with `SKILL.md` at the root plus optional `references/`, `scripts/`, `examples/`, `templates/`. Specs ship as ~10–200 files per skill — refs, helper scripts, sample data. Trying to encode that into a SQL `body TEXT` column means **encoding a filesystem inside another filesystem**: it bloats the DB, kills `code .` / `grep -r` ergonomics, marshals every read, and makes spec 0063's install pipeline (just `git clone` or `tar xz`) into a row-by-row INSERT loop wrapped in a transaction.

The right shape is the one the data already wants: **a directory tree on disk**. The DB keeps what it's good at — fast queries on small metadata (`name UNIQUE`, `description`, `source`, timestamps), FK relationships (`connector_skills`, `cron_skills`), audit log. Bytes belong on the volume Docker already mounts.

## Problem Statement

Three concrete blockers from the current single-file model:

1. **Skill-creator (spec 0063) can't install cleanly.** Anthropic's `skill-creator` is a multi-file skill. To install via the spec 0052 API today we'd have to either (a) flatten the tree into a single `body` blob (loses the structure that the SDK and Read tool expect), or (b) build a per-file CRUD pipeline that manually inserts each file into a hypothetical `skill_files` table. Both fight the data model.
2. **Skills with helper scripts / references can't exist.** The only "Zeno-shipped" skill we have today (`zeno-development`) is intentionally a single file because the schema forces it. A skill like Anthropic's `pdf` (PDF processing with helper Python scripts) is structurally impossible.
3. **Operator UX for non-trivial skills is bad.** Editing one paragraph in `references/api-flow.md` shouldn't require download → unzip → edit → rezip → upload. With the file tree on disk, the dashboard's per-file editor maps directly to one `fs.writeFile` call.

## Non-Goals

- **Out of scope: skill versioning / git history.** v1 = current state on disk is the truth. Operator who wants history puts `/workspace/skills/` under their own git repo. Future spec if real demand surfaces.
- **Out of scope: skill renames.** `name` stays UNIQUE and immutable in v1. To rename, operator deletes + reinstalls. (Same posture as spec 0052.)
- **Out of scope: editing zeno_default and profile skills via dashboard.** Their canonical paths (`agent/skills/<name>/`, `profiles/<n>/skills/<name>/`) are mounted read-only into the container. Dashboard shows them as read-only views. To edit, operator changes the host files (or the repo + image rebuild) — same posture they already have. **Delete is also out of scope for `zeno_default`** (the kebab menu Delete entry is hidden for that source — the row would be re-seeded on next boot anyway and the FS dir lives in the read-only image). Profile-source skills DO get a delete affordance with the reseed warning callout (artboard `72Y-0`), since that's the only way for an operator to clear out a stale DB row without restarting.
- **Out of scope: permanent deletion of profile skills via dashboard.** A profile-source skill's DB row is reseeded by `bootSkillsReconcile` on every worker boot (it's `INSERT OR IGNORE` from `profiles/<n>/skills/<name>/SKILL.md`). So deleting via dashboard removes the row only until next restart. Operator who wants permanent removal deletes the FS dir on the host. v1 accepts this — surface it in the dashboard delete modal copy ("This profile skill will be reseeded on next worker restart unless removed from `profiles/<n>/skills/`").
- **Out of scope: multi-file folder upload via browser.** v1 install path = upload a `.zip`. Drag-folder via `webkitdirectory` is browser-finicky and zip is the universal install format anyway. Any folder can be zipped before upload.
- **Out of scope: URL ingest** (`POST /api/skills { source_url: 'github.com/...' }`). That's spec 0063's job (server-side `git clone` for skill-creator).
- **Out of scope: per-file inline ADD via dashboard editor.** Operator can edit existing files inline; to add a new file they re-upload a zip with the new file included. (Adding a file is a one-API-call extension; revisit if it becomes a real friction point.)
- **Out of scope: per-file size beyond reasonable caps.** Skills are content, not deployment artifacts. No 100 MB binaries.
- **Out of scope: removing or rewriting the `connector_skills` and `cron_skills` tables.** They reference `skills.id` — unchanged.

## Constraints

- **DB stays single source of truth for *which* skills exist.** Bytes move to FS, metadata stays in DB. Spec 0052's invariant (`SkillRepo.list()` is the catalog) is preserved.
- **Migration must be additive + reversible per phase.** `body` column drop happens in a single migration AFTER a one-shot script writes existing dashboard-source bodies to disk. zeno_default and profile rows already have FS-canonical content, so they don't need migration.
- **Hot-reload must keep working.** ProfileWatcher today watches `~/.claude/skills/`. After this spec ships, the canonical paths are `agent/skills/`, `profiles/<n>/skills/`, and `/workspace/skills/`. Watcher must follow those (via `followSymlinks: true` if symlinks are used, or via explicit additional watch roots).
- **Atomic install.** Uploading a multi-file skill must either fully succeed or leave no trace. Strategy: extract zip to staging path `/workspace/skills/.tmp-<uuid>/`, validate, then atomic `rename()` to `/workspace/skills/<name>/`, THEN `INSERT skills`. Any failure → cleanup tmp dir, no DB write.
- **Path safety.** Zip extraction MUST reject entries with `..`, absolute paths, or symlinks. Same regex (`^[a-z][a-z0-9-]*$`) for the skill name as spec 0053. File paths within the skill: forbid leading `/`, forbid `..`, normalize separators.
- **Caps as sanity gates, not security.** Single-operator self-hosted threat model = operator is the gatekeeper. But caps prevent foot-shoot: **5 MB total per skill, 1 MB per individual file, 500 files per skill**. Reject upload at the API with a clear error message if exceeded.
- **Constitution principles:** YAGNI (no versioning, no rename, no folder-drag), Reversibility (FS+DB consistency reconciler runs at boot — cheap), Single source of truth (DB for "what skills exist"; FS for "what's in them"), Channel-first (this isn't a channel feature, but stays compatible with future channel-driven skill installs).

## User Stories

1. **Operator uploads a multi-file skill via dashboard.** `/skills` → `+ Install skill` → upload `skill-creator.zip` (~50 files). API extracts to `/workspace/skills/.tmp-<uuid>/`, validates `SKILL.md` + frontmatter + caps + path safety, atomically renames to `/workspace/skills/skill-creator/`, INSERTs `skills(name='skill-creator', source='dashboard', ...)`. Watcher fires → materializer ensures `~/.claude/skills/skill-creator` symlink → next agent turn the SDK auto-announces the skill in the system prompt (lazy discovery; no explicit reload).

2. **Operator edits one reference file inline.** `/skills/skill-creator` detail page shows a file tree on the left. Operator clicks `references/best-practices.md`, edits in the right-pane editor (Monaco or simple textarea), clicks Save. API does `fs.writeFile('/workspace/skills/skill-creator/references/best-practices.md', content)`. Watcher fires → reload. No re-upload.

3. **Operator views a zeno_default skill.** `/skills/zeno-development` detail page shows file tree (read-only badge). Editor is read-only. Source pill says `zeno_default · /agent/skills/zeno-development/`.

4. **Operator deletes a dashboard skill.** Type-to-confirm the name. API does `DELETE FROM skills WHERE id=?` (cascades `connector_skills` + `cron_skills`), then `rm -rf /workspace/skills/<name>/`. Watcher fires → reload (skill gone from `~/.claude/skills/`).

5. **Operator backs up.** `tar -czf zeno-backup.tar.gz /workspace/zeno.db /workspace/skills/`. Restore is the reverse. (`agent/skills/` ships in the image; `profiles/<n>/skills/` ships in the profile mount.)

6. **Power-user drops files via SSH.** Operator `cp -r my-skill /workspace/skills/my-skill`. Next worker boot, `bootSkillsReconcile` finds the new dir + valid SKILL.md, INSERTs the row. No dashboard step needed.

7. **Spec 0063 server-side install.** Spec 0063 will: `git clone https://github.com/anthropics/skills.git /tmp/anthropic-skills`, `cp -r /tmp/anthropic-skills/skill-creator /workspace/skills/skill-creator`, INSERT row. No special API beyond what 0062 ships. Hot-install (without worker restart) requires either (a) calling the same internal `bootSkillsReconcile` after the `cp`, or (b) accepting a brief operator-triggered `docker:restart`. Either is fine for 0063's first-install flow; the spec for 0063 picks. 0062 ships the FS volume + reconciler, which is the foundation either way.

## Success Criteria

**Phase A — DB migration + storage layer:**
- [ ] **One-shot pre-migration script** lives at `apps/worker/src/skills/migrate-bodies-to-fs.ts` (NEW file). It runs **once on worker boot, BEFORE `runMigrations(db)`**. **Splice point in `apps/worker/src/index.ts`**: insert immediately AFTER `const db = openDatabase(dbPath)` (line ~183) and BEFORE the existing `runMigrations(db)` call (line ~185). The script uses raw SQL via the `db` handle (no repo objects required — repos are constructed later in the file at lines 187+). The new boot order becomes: (1) `cleanupTmpExtractDirs()`, (2) **`preMigrateBodiesToFs(db, dashboardSkillsRoot, profileSkillsRoot)`**, (3) `runMigrations(db)`, (4) `bootSkillsReconcile(...)`, (5) `materializeSkillsToFs(...)`, (6) `ProfileWatcher.start(...)`. The current code already constructs repos AFTER `runMigrations` so no relocation is needed — the spec just inserts steps 1–2 between `openDatabase` and the existing `runMigrations` line.
- [ ] **Idempotency guard for the pre-migration script**: at entry, query `PRAGMA table_info(skills)`. If the `body` column is ABSENT, the migration already ran — skip silently. If `body` IS present, run the divergence check + write logic below. Safe across crashes: writing to `/workspace/skills/<name>/SKILL.md` is just an overwrite; flipping `source` is `UPDATE skills SET source='dashboard'` (idempotent if rerun).
- [ ] For each `skills` row (only when `body` column still exists per the guard above), compare DB `body` to the canonical-path SKILL.md body on disk:
  - `source='dashboard'` row → write `body` to `/workspace/skills/<name>/SKILL.md` (canonical path doesn't exist yet for this source). Idempotent.
  - `source='profile'` row → if FS body matches DB body, no-op (drop happens in next step). If they DIVERGE (operator edited via spec 0052 dashboard PATCH after first-boot INSERT-OR-IGNORE), write the DB body to `/workspace/skills/<name>/SKILL.md` AND flip the row's `source` to `'dashboard'`. **Name-collision resolution**: if a `dashboard` row with the same `name` already exists when about to flip, KEEP the existing dashboard row, DISCARD the diverged profile body, emit a WARN listing both rows so the operator can investigate. (This case is rare — requires both a previously-uploaded dashboard skill named `X` AND a profile skill named `X` whose body diverged. Forward-going UNIQUE prevents new collisions.) Emit a WARN log listing every flipped row so the operator sees what happened. The original profile FS file at `profiles/<n>/skills/<name>/SKILL.md` becomes orphaned (next reconciler boot would re-INSERT it as a NEW profile row only if the name is now free — but since the dashboard row took the name, it gets INSERT-OR-IGNORE'd into oblivion).
  - `source='zeno_default'` row → assert DB body equals FS body (these should ALWAYS match since spec 0053's UPSERT semantics rewrite DB from FS every boot). If they diverge (impossible in practice but defensive), trust FS, drop DB body silently.
- [ ] Migration drops `skills.body` column. (SQLite: recreate table without the column, copy rows.)
- [ ] `Skill` type loses `body` field. New helper: `SkillRepo.canonicalPath(skill: Skill): string` returns the FS path based on source enum. **Lives in `packages/storage/src/repos/skills.ts`** so both API (`apps/api/src/routes/skills.ts`) and worker (`apps/worker/src/skills/*.ts`) consume the same source — single location, no separate `canonical-paths.ts` module. **Type drop coordination**: removing `body` from `Skill` in `packages/storage/src/types.ts` and updating `rowToSkill` (which today does `row.body → skill.body`) MUST happen in the same commit as the migration that drops the column — otherwise the storage build breaks against either the old or new schema.
- [ ] **`SkillRepo` constructor change**: from `constructor(private readonly db: DB)` to `constructor(private readonly db: DB, private readonly roots: { agentSkillsRoot: string; profileSkillsRoot: string; dashboardSkillsRoot: string })`. Roots are injected so unit tests can stub them. **Call-site updates** (must all change in the same commit or compile breaks):
  - `apps/worker/src/index.ts` (line ~194): `new SkillRepo(db)` → `new SkillRepo(db, { agentSkillsRoot, profileSkillsRoot, dashboardSkillsRoot })`. The three values come from the existing `resolveAgentSkillsRoot()` (line 131) + `resolveProfileSkillsRoot()` (line 144) helpers, plus a new `DASHBOARD_SKILLS_ROOT` constant = `/workspace/skills`.
  - `apps/api/src/index.ts` (line ~54: `const skillRepo = new SkillRepo(db)`) — same. The API doesn't currently call `resolveAgentSkillsRoot` — add a hard-coded `agentSkillsRoot: '/app/agent/skills'` (matches the runtime container path; document in the constant comment), `profileSkillsRoot: '/app/profile/skills'` (same), `dashboardSkillsRoot: '/workspace/skills'`. These are constants because the API doesn't run the same boot dance. **Implementer cross-check before committing**: `grep -n 'agent/skills\|profile/skills\|/workspace' infra/docker-compose.*.yml` — confirm the mount points still match. If the compose files have evolved (e.g., a profile is mounted at a different path), reconcile. (Note: `apps/api/src/server.ts` only **passes through** an already-constructed `skillRepo` via `AppDeps`; it doesn't call `new SkillRepo`. The single construction site is `apps/api/src/index.ts`.)
- [ ] **`bootSkillsReconcile` and `materializeSkillsToFs` use `skillRepo.canonicalPath(skill)` rather than computing paths locally.** This keeps a single source of truth for the source→path mapping. The current `materialize.ts` derives paths from `claudeHome`; rewrite to call `skillRepo.canonicalPath` for the symlink target (the `~/.claude/skills/<name>` symlink path itself is computed from `claudeHome` as today).
- [ ] Existing `SkillRepo.upsertBySource({ name, description, body, source })` becomes `upsertBySource({ name, description, source })` — `body` no longer takes a parameter (the writer is whoever owns the FS path). **Caller updates**: 
  - `apps/worker/src/skills/seed.ts:readSkillFile` returns `ParsedSkill` with `body` today — strip the field from the return type. The function still parses the frontmatter to extract `name` + `description`; the body content remains on disk and the parser doesn't need to retain it. All call sites of `readSkillFile` lose the `body` reference.
  - `bootSkillsReconcile` currently spreads `{ ...file, source: 'zeno_default' }` (or `'profile'`) — after the type change, this spread no longer carries `body`. No defensive `delete` needed.
  - `SkillRepo.create()` callers in `apps/api/src/routes/skills.ts` (POST handler) — same drop.
- [ ] **`SkillRepo.update(id, patch)` signature** drops the `body` field from `patch`. Today the method accepts `{ description?: string; body?: string }` (line 142-164 of the repo). After this spec it accepts `{ description?: string }` only. The route handler for `PATCH /api/skills/:id` already special-cases description; this just makes the repo API match.
- [ ] **Dead code removal in `apps/api/src/routes/skills.ts`**: the helpers `recompose(skill)` (rebuilds a `.md` from frontmatter + body), `writeSkillToFs(...)` (writes recomposed file to `${claudeHome}/skills/<name>/SKILL.md`), and `deleteSkillFromFs(...)` (removes that path) become broken/dead after `body` is dropped. All three MUST be deleted in the same commit that removes `body` from the `Skill` type. The new flow puts FS writes in: (a) the zip-install pipeline (Phase C), (b) `PUT /api/skills/:id/files/:path` handler (Phase C), (c) the materializer's symlink writer (Phase B). The route file no longer holds FS-write helpers.
- [ ] **`/api/skills/download-all` endpoint behavior**: today it streams a zip of `recompose(skill)` for each skill (every entry is a single `.md`). After this spec it must stream a zip-of-zips OR a flattened zip with each skill as a sub-directory (preserving the file-tree structure). Recommended: each skill becomes a `<name>/` directory entry inside the bundle, exact mirror of canonical FS layout. Implementation: iterate skills, for each call the same internal helper that powers `GET /api/skills/:id/download` and stream into a parent archive at the correct sub-path. Tests in `apps/api/tests/routes/skills.test.ts` (lines 428-436) updated accordingly.
- [ ] **API hardening**: existing `PATCH /api/skills/:id` (description-only) returns 403 `skill_source_immutable` for `source='profile'` (matching the existing block on `zeno_default`). Spec 0052's accidental allowance of profile-PATCH is closed in this spec.
- [ ] All existing repo tests updated; no body assertions.

**Phase B — worker runtime:**
- [ ] `bootSkillsReconcile` extends to scan `/workspace/skills/` (in addition to `agent/skills/` and `profiles/<n>/skills/`). For each `<name>/SKILL.md` found, parse frontmatter, UPSERT `skills` row with the right source. **Boot cleanup task** (runs first, before reconciler): `rm -rf /workspace/skills/.tmp-*` to clean up any partial-extract orphans from a prior crash. **NEW exported function `cleanupTmpExtractDirs(dashboardSkillsRoot: string): Promise<void>` to be added to `apps/worker/src/skills/materialize.ts`** — the parameter is the same `/workspace/skills` value passed to `SkillRepo` and `materializeSkillsToFs`. Imported and called from `apps/worker/src/index.ts` boot sequence step 1.
- [ ] **Orphan-cleanup with safety guard**: `dashboard`-source rows whose canonical FS dir is missing are DELETED — BUT only if `/workspace/skills/` itself exists AND contains at least one `<name>/SKILL.md` (sanity gate). If `/workspace/skills/` is missing or empty (e.g., DB restored from backup without the volume), emit a WARN log listing every dashboard row that WOULD have been deleted, and skip the delete. This protects against silent mass-deletion during partial disaster recovery.
- [ ] `materializeSkillsToFs` becomes **symlink-based**: for each skill in DB, create `${claudeHome}/skills/<name>` as a symlink to the canonical path. Existing dirs/symlinks at that location are removed first to handle delete + reinstall. (Implementation detail: write to `${claudeHome}/skills/.tmp-<name>` then `rename`, atomic.)
- [ ] **`ProfileWatcher` change — concrete API delta**:
  - **Today** (spec 0052): `ProfileWatcher` accepts `agentPath`, `profilePath`, `skillsPath?` (= `${claudeHome}/skills/`). Three watch roots, three `SourceKind` values: `'agent' | 'profile' | 'skills'`. The 'skills' bucket watched the materialized symlink dir. The `classify(source, filename)` function returns `'skills'` only when `source === 'skills'` — events under `agent/skills/` and `profile/skills/` arrive with `source === 'agent'` / `'profile'` and currently fall through to `'ignored'`.
  - **After 0061**: 
    - `skillsPath` parameter is RENAMED to `dashboardSkillsPath` and points at `/workspace/skills/`. **The `SourceKind` union itself is UNCHANGED** — events from this watch root are still emitted with `source === 'skills'`, and `classify` still branches on `'skills'` for them. Only the option/prop name changes; the runtime label stays the same to avoid touching every `case 'skills':` in the watcher pipeline. **Both the interface field AND the named call-site prop in `apps/worker/src/index.ts` (~line 523, ProfileWatcher constructor)** must be renamed in the same commit (TypeScript compile will break otherwise).
    - `classify` is EXTENDED to also return `'skills'` when `source === 'agent'` AND `filename` starts with `skills/` (relative path), and similarly for `source === 'profile'`. Without this, SSH-drops or rebuild-image swaps of agent/profile skills would not fire hot-reload — the spec's "User Story 6 — power-user drops files" depends on this. **Concrete test case**: `classify('agent', 'skills/zeno-development/SKILL.md')` MUST return `'skills'`; `classify('profile', 'skills/fn-code-review/references/foo.md')` MUST return `'skills'`; `classify('agent', 'SOUL.md')` MUST still return `'prompt'`; `classify('profile', 'config.yaml')` MUST still return `'crons'`.
    - **Phase B kickoff sanity check**: implementers MUST verify that `fs.watch(agentRoot, { recursive: true })` actually delivers `filename === 'skills/zeno-development/SKILL.md'` (the relative path) on the target OS — Linux inotify does this reliably, macOS FSEvents has historically been finicky and may deliver only the leaf filename or the absolute path. If the runtime delivers something other than the expected relative path, the fallback lives in `apps/worker/src/profile/watcher.ts` (same file as `classify`): store the absolute path that triggered the event, resolve the matching watched root to derive `source` + relative path, then call `classify`. This is a day-1 requirement on macOS dev environments and a no-op safety net on Linux containers — implementer adds ~10 lines to the watcher event handler. If Linux-only deployment is acceptable, document and skip; otherwise must ship.
    - The materialized dir `${claudeHome}/skills/` is NO LONGER WATCHED — it's a symlink farm regenerated by the materializer. Watching it would just produce duplicate events.
  - **Materializer is invoked on every `'skills'` event**: the existing `onSkillsChanged` callback (`apps/worker/src/index.ts:540-545` — currently a log-only no-op) is REWRITTEN to call `materializeSkillsToFs(...)`, then continue logging the event for observability. **No explicit AgentCore reload exists or is needed**: the Claude Agent SDK auto-discovers `~/.claude/skills/` lazily on each query, so a fresh symlink farm is sufficient. The existing comment at line 537 ("SDK will re-discover on next query") stays accurate. For an inline-edit event the materializer is effectively a no-op (symlink already correct); for an install event (new `<name>/SKILL.md` appears) the materializer creates the new symlink. Wrap the materializer call in `try/catch` so a transient FS error doesn't kill the watcher loop. Confirm the materializer runs on file-edit events at acceptable cost: SELECT all skills + symlink-stat per row is < 10 ms for typical N (~10 skills), well under the debounce window.
  - Debounce window unchanged. Event payload unchanged (still `{ source: SourceKind, path: string }`).
- [ ] **Two paths sync `skills.description` on SKILL.md change** — both must be implemented and idempotent:
  - **API path** (synchronous): `PUT /api/skills/:id/files/SKILL.md` handler, after `fs.writeFile`, re-parses frontmatter and UPDATEs `skills.description` if it differs from the current row.
  - **Watcher path** (asynchronous, fires on power-user SSH-edits or on the same API write): ProfileWatcher's debounced 'skills' bucket reads the changed SKILL.md, re-parses frontmatter, UPDATEs description if differs. Idempotent: if API path already synced, watcher's UPDATE is a no-op.
  - Implementation note: the watcher path catches edits made outside the API (operator drops a file via SSH). It is NOT a duplicate of the API write — it's the safety net for non-API mutations. The redundant write that fires after a normal API PUT is cheap (one SELECT + UPDATE) and acceptable.
- [ ] Worker tests: install dashboard skill (writes to `/workspace/skills/`), reload propagates; delete dashboard skill, FS cleaned + DB row gone; profile skill survives DB row delete (FS stays since it's read-only mount).

**Phase C — API:**
- [ ] `POST /api/skills` — multipart `file` field accepting `.zip`. **Library**: `unzipper` (npm, streaming entry-by-entry API; the `archiver` dep already in `apps/api/package.json` is write-only). **Add the dep**: `pnpm add unzipper --filter @zeno/api` + `pnpm add -D @types/unzipper --filter @zeno/api` (it's a separate types pkg). Pipeline: **streaming extract** via `unzipper.Parse()` to `/workspace/skills/.tmp-<uuid>/` with running per-entry size, total size, and entry count counters that abort mid-extract if any cap exceeded → validate (SKILL.md exists, frontmatter parses, name kebab-case + UNIQUE, path safety per file) → atomic rename to `/workspace/skills/<name>/` → INSERT `skills` row → return 201 with skill ID. **Caps enforced during extract, not after**: per-file abort at 1 MB; total-size abort at 5 MB; file-count abort at 500 (zip headers can lie about counts; use actual entries unpacked). Hard abort margin: refuse to keep extracting past 10 MB total even if validation later trims it down (defends the volume from a malicious 200 MB zip header). On any validation error: cleanup tmp dir, return 4xx with error code (`skill_name_taken`, `skill_size_exceeded`, `skill_file_too_large`, `skill_too_many_files`, `skill_path_invalid`, `skill_frontmatter_missing`, etc.).
- [ ] **Path encoding convention** for the file-CRUD endpoints below: client URL-encodes `/` as `%2F` (so `references/foo.md` → `:path = references%2Ffoo.md`); server `decodeURIComponent`s to the raw path before validation. Test cases for both `references/foo.md` and `references%2Ffoo.md` go in the route test suite.
- [ ] **Error response envelope** (consistency with existing `apps/api/src/routes/skills.ts` patterns): all new endpoints return `{ error: string, message?: string }` for 4xx/5xx. `error` is always a snake_case code (`skill_name_taken`, etc.); `message` is an optional human-friendly string when extra context helps the dashboard render a useful error. No other top-level fields in error responses.
- [ ] `GET /api/skills/:id/files` — returns file tree as `Array<{ path: string, sizeBytes: number, mimeType: string }>`. Read from canonical FS path. 404 if skill not found.
- [ ] `GET /api/skills/:id/files/:path` — stream individual file content. `Content-Type` inferred from the resolved path. Path safety: reject `..` and absolute paths server-side. 404 if file not found.
- [ ] `PUT /api/skills/:id/files/:path` — overwrite file content. Body is the new content (max 1MB). Only allowed for `source='dashboard'` skills (read-only sources return 403 with `skill_source_immutable`). If decoded `path === 'SKILL.md'` and frontmatter changed, also UPDATE `skills.description` in DB. (See Phase B — the watcher's debounced reload may also re-trigger the description UPDATE; idempotent by design.)
- [ ] `DELETE /api/skills/:id/files/:path` — remove single file. Only `source='dashboard'`. Forbid deleting `SKILL.md` (returns 422 `skill_md_required`).
- [ ] `GET /api/skills/:id/download` — stream a zip of the canonical dir using the existing `archiver` dep (already in `apps/api/package.json`). Works for all sources. **Breaking change**: this REPLACES the spec-0052 endpoint that streamed `text/markdown` of the body. The old format is retired entirely with this spec; no `?format=` query parameter, no parallel route.
- [ ] **Pre-implementation grep task** (run BEFORE touching the download endpoint, by the implementer of Phase C): execute `grep -rE 'skills/[^/]+/download|/api/skills/[^/]+/download' apps/dashboard apps/api/tests tmp` from the repo root. Expected result: only the dashboard's existing `<a href="/api/skills/${s.id}/download">` link in `apps/dashboard/src/routes/_authed/skills.$id.tsx` and the existing API tests at `apps/api/tests/routes/skills.test.ts` lines 407-436. If anything else surfaces (e.g., an operator script in `tmp/` that depends on `text/markdown`), STOP and notify the operator before flipping the response shape. Document the grep output in the commit message that ships the endpoint change.
- [ ] **`SkillsRouteDeps.claudeHome` removal**: today the `SkillsRouteDeps` interface in `apps/api/src/routes/skills.ts` (line ~38) holds `claudeHome: string`, used by the dead helpers `writeSkillToFs` / `deleteSkillFromFs`. After their removal (Phase A), `claudeHome` is unused by the route — DELETE the field from the interface AND from the wiring in `apps/api/src/server.ts` where `buildSkillsRoute({ ..., claudeHome })` is called. Keeping a dead dep gives implementers a misleading hook into the route. Same commit as the helper deletion.
- [ ] Existing `GET /api/skills`, `GET /api/skills/:id`, `PATCH /api/skills/:id` (description-only), `DELETE /api/skills/:id` — preserved, but `skills.body` field removed from responses.
- [ ] **`GET /api/skills/:id` aggregate fields** (used by Phase D delete modal). Add to the JSON response: `connectorSkillsCount: number` (= `connectorSkillRepo.listForSkill(id).length`) and `cronSkillsCount: number` (= `cronSkillRepo.listForSkill(id).length`). Both repos already exist with `listForSkill(skillId)` — call them from the route handler, not via a new repo aggregate method. **Two-step interface change**: (i) extend the `SkillsRouteDeps` interface in `apps/api/src/routes/skills.ts` with `connectorSkillRepo: ConnectorSkillRepo` + `cronSkillRepo: CronSkillRepo`, AND (ii) wire the existing repo instances through the `buildSkillsRoute` call site in `apps/api/src/server.ts`. Both files change — without (i) the route handler can't reference the repos; without (ii) the dep is undefined at runtime.
- [ ] API tests: install zip (success + each error path), per-file CRUD on dashboard skill, per-file 403 on zeno_default / profile, download zip + roundtrip.

**Phase D — Dashboard:**

> **Visual contract**: every component below MUST match the locked Paper artboards in spec 0061 (artboard IDs catalogued in `context/specs/2026-04-30-skills-multi-file-paper/tasks.md`). The locked palette tokens live in that same file and are reproduced inline below. Implementer pulls exact pixel values from the artboards via Paper MCP `get_jsx` / `get_computed_styles` when wiring up styles.

- [ ] `/skills` list — preserved from spec 0052; no longer shows body anywhere.
- [ ] `/skills/:id` detail (artboard `6JK-0` for dashboard, `6OQ-0` for read-only sources) — file tree on left (collapsible, 280px wide), file viewer/editor on right (fills). Read-only views for zeno_default and profile. Per-file save button only for dashboard. SKILL.md edit blocks the body — operator can edit description via the existing `Edit description` modal which writes both the DB row and the SKILL.md frontmatter. **Editor**: a plain `<textarea>` is enough for v1 — Monaco's ~5 MB bundle isn't justified for a single-operator dashboard. If syntax highlighting becomes a real friction point (e.g., editing Python helpers), revisit in a follow-up.
- [ ] **Detail page header row** (artboard `6JK-0`): 56×56 icon container (panel-2 bg `#0F1119`, hairline border `#151824` — visually a thin dark stroke, NOT a gold accent; the `gold-line` token name in the design system refers to the family of 1px strokes on panel-2 surfaces, but the resolved color is the dark `#151824`) + h1 with skill name (mono 26px, color `#E8EAF5`) + description prose (Inter 13px, color `#8A8FAB`) + **meta line** + source pill + Edit description button + kebab menu. The meta line shows `installed Xd ago · N files · X KB total`. **`N files` and `X KB total` come from `GET /api/skills/:id/files`** — the detail route fires this query alongside the skill detail query and uses `files.length` for the count and `files.reduce((sum, f) => sum + f.sizeBytes, 0)` for the total. While the files query is loading, render `— files · — KB` placeholders (no layout shift).
- [ ] **Source pill component** (used in detail header AND in skills list rows). Three locked variants by source enum:
  - `dashboard` → bg `#1B1F2E`, border `#2A2F45`, text `#8A8FAB` (neutral). Dot color `#8A8FAB`.
  - `zeno_default` → bg `#D9B3621A`, border `#D9B36247`, text `#D9B362` (gold). Dot color `#D9B362`.
  - `profile` → bg `#7AA6E81A`, border `#7AA6E847`, text `#7AA6E8` (cyan). Dot color `#7AA6E8`.
  - Implemented as `<SkillSourcePill source={skill.source} />` — single component branching on the enum. **Lives in `apps/dashboard/src/components/skills/skill-source-pill.tsx`** (NEW file). Used by skills list, skill detail header, install modal preview card, and delete modal headers — single source of truth for the visual contract.
- [ ] **`Edit description` button visibility** (artboard `6JK-0` shows it; artboard `6OQ-0` shows it HIDDEN): the button renders only when `skill.source === 'dashboard'`. For zeno_default and profile sources, the button is OMITTED from the DOM (not just disabled — the spec's Non-Goal is editing those sources at all from the dashboard). The kebab menu still renders for all sources (it holds Download zip, Copy ID, etc., which are read-OK actions).
- [ ] **`Save` button states for the editor pane** (artboard `6JK-0` enabled; artboard `6OQ-0` disabled with tooltip):
  - Enabled (`source === 'dashboard'`): bg `#D9B362` (gold), text `#08090F`, font-weight 600. Click → PUT mutation.
  - Disabled (`source === 'zeno_default' | 'profile'`): bg `#1B1F2E`, text `#8A8FAB`, opacity 0.4. `disabled` attribute on the button. `<Tooltip>` content: "read-only — edit on the host". Footer-left helper text replaced by canonical-path hint: `ships with agent image · edit at /app/agent/skills/<name>/ on host` (zeno_default) or `mounted from profile dir · edit at profiles/<n>/skills/<name>/` (profile).
- [ ] **File tree component** (`apps/dashboard/src/components/skills/skill-file-tree.tsx`, NEW): renders the flat array from `GET /api/skills/:id/files` as a collapsible tree. Indent steps of 14px; chevron + file/folder icon in 10×10 fixed-width slots (flexShrink: 0). Selected row uses bg `#D9B3621A` + 2px gold left border. Folders track open/closed in component state (default open for `references/`, `scripts/`, `examples/`, `templates/`).
- [ ] **React Query invalidation strategy per mutation** (load-bearing — without this the dashboard shows stale data after mutations):
  - `POST /api/skills` (upload) → `qc.invalidateQueries({ queryKey: ['skills'] })` (list refetch).
  - `PUT /api/skills/:id/files/:path` → `qc.invalidateQueries({ queryKey: ['skills', id, 'files'] })`. If `path === 'SKILL.md'`, ALSO invalidate `['skills', id]` (description may have changed).
  - `DELETE /api/skills/:id/files/:path` → `qc.invalidateQueries({ queryKey: ['skills', id, 'files'] })`.
  - `PATCH /api/skills/:id` (description only) → `qc.invalidateQueries({ queryKey: ['skills', id] })` AND `qc.invalidateQueries({ queryKey: ['skills'] })` (list shows description).
  - `DELETE /api/skills/:id` → `qc.removeQueries({ queryKey: ['skills', id] })` + `qc.removeQueries({ queryKey: ['skills', id, 'files'] })` THEN `qc.invalidateQueries({ queryKey: ['skills'] })`.
- [ ] **Install modal — success preview** (artboard `6UD-0` "M-skill-1v2"): accepts `.zip` (replaces the spec 0052 `.md`-only picker). Preview reads SKILL.md frontmatter from the zip in-browser via **`fflate`** (~10 KB minified, browser-native, no extraction-to-FS step). The modal reads the file via the `<input type="file">` API as `ArrayBuffer`, calls `fflate.unzip(buf)` to get a flat `{ [path]: Uint8Array }`, locates the `SKILL.md` entry, parses YAML frontmatter (existing `yaml` parser), shows preview. Confirm submits the original zip (not the in-memory parse) to POST. **Add the dep**: `pnpm add fflate --filter @zeno/dashboard`. **Visual contract elements (from `6UD-0`)**: corner brackets (gold L-shapes), kicker `INSTALL · SKILL`, h2 `Add skill from zip` (zip in italic gold, Fraunces 24px), file picker block in success-green (`#5BD17C0F` bg + `#5BD17C4D` border) showing filename + size + count + "zip valid · frontmatter parsed", `EXTRACTED PREVIEW` label, preview card with rows `name / desc / files / top-level / source`, top-level chips (SKILL.md gold, folders neutral), `<SkillSourcePill source="dashboard" />` reused, validation note (green) "passes all checks · within caps · no path violations", footer with `cancel` (outline) + primary gold `INSTALL →` button.
- [ ] **Install modal — error variants** (artboard `6WK-0` "M-skill-1c", four variants stacked: `skill_frontmatter_missing`, `skill_name_taken`, `skill_size_exceeded`/`skill_file_too_large`, `skill_path_invalid`). The same modal shell as the success preview, with the preview card region replaced by a **red error banner** (bg `#E55A4F0F`, border `#E55A4F4D`) and the file picker block tinted red (same color tokens). Banner contents differ per variant — implement as a discriminated union on the API error code returned by `POST /api/skills`. **Footer Install button is DISABLED** (bg `#1B1F2E`, opacity 0.45) when an error is present. Footer-left text changes to `cannot install · <reason>` (red `#E55A4F`) — `invalid bundle` / `name conflict` / `over caps` / `safety violation`. Each variant maps 1:1 to an API error code, so the modal subscribes to the POST mutation's error and switches banner content via a small `<InstallErrorBanner code={...} detail={...} />` sub-component. Implementer reproduces icon + copy from the artboard for each code.
- [ ] **Delete modal — dashboard cascade** (artboard `71K-0` "M-skill-4v2", 520px wide): single rounded shell (no corner brackets — that's the install convention; destructive uses the CH-3 shape). Header: `⚠ destructive · cannot undo` kicker (red `#E8617A`) + h2 `delete <name>?` (mono 22px). Body description (Inter 14px). `CASCADE PREVIEW` label + cascade card (bg `#151824`) with three bullets:
  - `<N>` files will be removed from `<canonicalPath>` (red trash icon)
  - `<M>` connector links will be unlinked (`<connectorNames>`) (gold link icon, gold count)
  - `<K>` cron link(s) will be unlinked (`<cronNames>`) (gold clock icon, gold count)
  - Reassurance line below dashed separator: `connectors and crons are preserved · only the link rows are deleted` (with green check icon)
  - Counts come from `connectorSkillsCount` / `cronSkillsCount` on the skill detail query response. Names come from a follow-up fetch (`GET /api/connector-skills?skillId=<id>` and `/api/cron-skills?skillId=<id>` — both already exist from spec 0052). The modal shows skeleton bullets while names load; counts render immediately from the cached detail response.
  - Type-to-confirm input below cascade card: label `Type \`<name>\` to confirm:`, single-line input bordered with `#E8617A40` (red soft). Submit enabled only when input value matches name.
  - Footer: `↳ removes from disk + db row + N link rows` left, `cancel` outline + destructive `🗑 delete skill` (bg `#E8617A24`, border `#E8617A`, text `#E8617A`).
- [ ] **Delete modal — profile reseed variant** (artboard `72Y-0` "M-skill-4v2-profile"): SAME modal shell + cascade card + type-to-confirm as the dashboard variant, with TWO additions:
  - Header row gets a `profile` source pill (cyan, reused `<SkillSourcePill source="profile" />`) inline with the kicker.
  - **Yellow callout banner** rendered ABOVE the cascade preview card. **NEW component `<DeleteReseedCallout />` in `apps/dashboard/src/components/skills/delete-reseed-callout.tsx`**. Visual contract: bg `#D9B36214`, border `#D9B36247`, border-radius 6px, padding 14px, gold warning triangle icon (16×16, stroke `#D9B362`), heading line "profile skill — will be reseeded on next worker restart" (mono 11px, color `#D9B362`, weight 600), body paragraph explaining the reseed mechanic with `<code>` for the host path (`profiles/<name>/skills/<name>/`), and a footer line below a dashed gold separator: `→ to delete permanently, remove the host directory` (italic, color `#D9B362`).
  - Cascade preview bullets adjust for profile source: bullet 1 becomes `1 DB row + symlink at ~/.claude/skills/<name>` (the FS dir at `profiles/<n>/skills/<name>/` is NOT removed — it's read-only); reassurance line becomes `host dir profiles/<n>/skills/<name>/ stays untouched` (cyan check icon).
  - Footer-left text becomes `↳ reseed unless host dir removed`.
  - Modal selection logic: in the route, branch on `skill.source` — `'dashboard'` → render `<DeleteSkillModalDashboard />`; `'profile'` → render `<DeleteSkillModalProfile />`. (zeno_default has no delete affordance — the kebab menu's Delete entry is hidden for that source per Non-Goal "Out of scope: editing zeno_default and profile skills via dashboard" extended to deletes.)
- [ ] Dashboard tests:
  - Install modal preview: given a fixture zip with `SKILL.md` + `references/x.md`, fflate parses + frontmatter renders correctly; given a zip without `SKILL.md`, modal shows the `skill_frontmatter_missing` error variant.
  - Install modal error variants: each of the 4 error codes (`skill_frontmatter_missing`, `skill_name_taken`, `skill_size_exceeded`, `skill_path_invalid`) renders the matching banner + disabled Install button.
  - File tree component: renders flat array as a tree; collapsible folders work; chevrons + dots align in fixed-width slots.
  - File editor: read-only mode for `zeno_default` / `profile` source skills (save button disabled with tooltip "read-only — edit on the host"); write mode for `dashboard` (PUT call fires).
  - Source pill: snapshot test for each of the three variants (dashboard / zeno_default / profile) — colors match the locked palette.
  - Edit description button visibility: hidden for `zeno_default` / `profile`; shown for `dashboard`.
  - Delete modal (dashboard): cascade preview shows correct file count, connector links count, cron links count; type-to-confirm gates the submit button.
  - Delete modal (profile): renders the yellow reseed callout above the cascade card; cascade bullets match the profile-specific copy; submit gated by type-to-confirm.
  - Existing tests adjusted: any test that read `body` field on the skill detail query is updated to use the new `/files` endpoint.

**Phase E — quality gate + E2E:**
- [ ] `pnpm run quality-gate` — 30/30 turbo green. Test count delta: roughly +15 new tests (storage migration, reconciler with /workspace/skills/, materializer symlink, API zip pipeline, API per-file CRUD, dashboard tree editor).
- [ ] E2E live test against `zeno-fn` container on port 3001 — **success-path smoke only; error-variant coverage is in Phase C route tests + Phase D dashboard tests, NOT replicated here. Don't allocate E2E time for the 4 install error variants — the unit tests cover them.**
  - Build a real multi-file zip: `SKILL.md` + `references/foo.md` + `scripts/helper.sh` (small, sane content). Upload via `/skills` install modal.
  - Expect: 201 from API, row in `skills`, files at `/workspace/skills/<name>/`, symlink at `~/.claude/skills/<name>` → `/workspace/skills/<name>`, watcher event in worker logs (`event: 'skills_reloaded'`) AND materializer event (`event: 'skills_materialized'`) — both confirm the full pipeline ran. Next agent query sees the skill.
  - Mention `@zeno-agent` in `#C0EXAMPLE000` with a request that matches the test skill's description. Verify the agent reads the skill (worker logs show `Skill` tool or `Read` of SKILL.md).
  - Edit `references/foo.md` via dashboard inline editor. Save. Verify file content on disk + watcher reload.
  - **Download zip round-trip smoke**: `GET /api/skills/<id>/download` → assert content-type is `application/zip`, save the bytes, re-upload via `POST /api/skills` (after the original is deleted to avoid name collision), assert the re-uploaded skill has the same files with the same content. Catches the spec-0052→0062 download endpoint replacement breaking silently.
  - Delete the test skill. Verify row gone, FS cleaned, symlink removed.

## Architecture

### Component map

```
packages/storage/src/
├── migrations.ts                                 # +migration: drop body column
└── repos/skills.ts                               # remove body field; add canonicalPath helper

apps/worker/src/skills/
├── migrate-bodies-to-fs.ts                       # NEW: one-shot pre-migration script (runs before runMigrations)
├── seed.ts                                       # extend bootSkillsReconcile with /workspace/skills/ scan; drop body from upsertBySource calls
└── materialize.ts                                # rewrite as symlink-based

apps/worker/src/profile/
└── watcher.ts                                    # watch canonical paths; reparse frontmatter on SKILL.md change

apps/worker/src/index.ts                          # boot reconciliation gains /workspace/skills/ root

apps/api/src/
├── lib/
│   ├── skill-zip.ts                              # NEW: extract + validate zip, atomic rename
│   └── parse-skill-frontmatter.ts                # spec 0052 — preserved, used by both upload + watcher
└── routes/skills.ts                              # +file CRUD, +zip upload, +download zip; remove body field

apps/dashboard/src/
├── components/skills/
│   ├── skill-source-pill.tsx                     # NEW: 3-variant pill (dashboard/zeno_default/profile), reused everywhere
│   ├── skill-file-tree.tsx                       # NEW: collapsible tree on detail page
│   ├── skill-file-editor.tsx                     # NEW: textarea + read-only/disabled state per source
│   ├── skills-install-modal.tsx                  # rewrite for zip — accepts .zip, fflate preview
│   ├── install-error-banner.tsx                  # NEW: 4 error variants for M-skill-1c (frontmatter/name/size/path)
│   ├── delete-skill-modal-dashboard.tsx          # NEW: cascade preview + type-to-confirm (artboard 71K-0)
│   ├── delete-skill-modal-profile.tsx            # NEW: same shell + reseed callout (artboard 72Y-0)
│   └── delete-reseed-callout.tsx                 # NEW: yellow "will be reseeded" banner used inside profile delete modal
└── routes/_authed/
    └── skills.$id.tsx                            # rewrite for tree/editor layout

context/specs/2026-04-30-skills-multi-file-impl/
├── spec.md                                       # this file
├── plan.md                                       # next file (after spec 0061 Paper approved)
└── tasks.md                                      # next file
```

### Boot sequence (after spec 0061 ships)

```
apps/worker/src/index.ts call order:

1. cleanupTmpExtractDirs()         rm -rf /workspace/skills/.tmp-*           (defend partial-extract orphans)
2. preMigrateBodiesToFs(db, ...)   one-shot — guarded by PRAGMA table_info(skills) absence of `body` col
                                   (writes diverged dashboard/profile bodies to /workspace/skills/, flips source if needed)
3. runMigrations(db)               SQLite migration drops skills.body column (idempotent — checks current schema)
4. bootSkillsReconcile(...)        scan agent/skills/, profiles/<n>/skills/, /workspace/skills/
                                   → UPSERT skills rows (source-aware), DELETE dashboard orphans (safety guard)
                                   → re-parse frontmatter and update description on changed SKILL.md
5. materializeSkillsToFs(...)      for each skill row, ensure ${claudeHome}/skills/<name> is a symlink
                                   to canonicalPath(skill) (atomic via tmp-symlink + rename)
6. ProfileWatcher.start(...)       watches agent/, profile/, /workspace/skills/ (NOT ${claudeHome}/skills/)
```

Steps 1–2 are idempotent. Step 3 (the SQLite migration) is one-shot per the existing migrations table. Steps 4–6 run every boot.

### Source → canonical path mapping

```ts
// packages/storage/src/repos/skills.ts (method on SkillRepo)
canonicalPath(skill: Skill): string {
  switch (skill.source) {
    case 'zeno_default': return `${this.agentSkillsRoot}/${skill.name}`;     // /app/agent/skills/<name>
    case 'profile':      return `${this.profileSkillsRoot}/${skill.name}`;   // /app/profile/skills/<name>
    case 'dashboard':    return `${this.dashboardSkillsRoot}/${skill.name}`; // /workspace/skills/<name>
  }
}
```

`agentSkillsRoot` and `profileSkillsRoot` are mounted read-only via docker-compose. `dashboardSkillsRoot` is a writable persistent volume (`/workspace/skills/`). All three are injected at `SkillRepo` construction time so unit tests can stub them.

### Data flow at install (dashboard zip upload)

```
POST /api/skills (multipart: file=skill.zip)
  ↓
streaming-extract /workspace/skills/.tmp-<uuid>/   (unzipper, abort-on-cap)
  ↓
validate:
  - SKILL.md exists at root
  - frontmatter has name (kebab-case, UNIQUE in DB) + description
  - file count ≤ 500, total ≤ 5 MB, per-file ≤ 1 MB
  - no path traversal (../, absolute, symlinks)
  ↓
mv /workspace/skills/.tmp-<uuid>/ /workspace/skills/<name>/   [ATOMIC]
  ↓
INSERT INTO skills (id, name, description, source) VALUES (?, ?, ?, 'dashboard')
  ↓
ProfileWatcher fires on /workspace/skills/<name>/SKILL.md create
  ↓
materializer recreates symlink ${claudeHome}/skills/<name> → /workspace/skills/<name>
  ↓
(no explicit AgentCore reload — SDK lazily reads ~/.claude/skills/ on next query)
  ↓
return 201 { id, name, description, source }
```

### Data flow at inline file edit

```
PUT /api/skills/:id/files/references%2Ffoo.md  (body = new content)
  ↓
load skill row, assert source='dashboard'
  ↓
resolve canonical path; reject ../ in path
  ↓
fs.writeFile('/workspace/skills/<name>/references/foo.md', body)
  ↓
if path === 'SKILL.md': re-parse frontmatter; UPDATE skills.description if changed
  ↓
ProfileWatcher fires on file change
  ↓
materializer no-op (symlink already points to canonical), reload
  ↓
return 204
```

### Data flow at delete

```
DELETE /api/skills/:id
  ↓
load skill row, capture source + canonicalPath
  ↓
DELETE FROM skills WHERE id = ?    (cascades connector_skills, cron_skills)
  ↓
if source='dashboard': rm -rf /workspace/skills/<name>/
  (zeno_default / profile: leave canonical FS intact — operator may reinstall later)
  ↓
ProfileWatcher fires on dir removal
  ↓
materializer removes symlink ${claudeHome}/skills/<name>
  ↓
(SDK won't see the skill on next query — discovery is lazy)
  ↓
return 204
```

## Test plan / Success criteria summary

This spec ships when ALL the following pass:

**Phase A storage:**
- [ ] Pre-migration script writes existing dashboard bodies to `/workspace/skills/<name>/SKILL.md`; tested in storage integration test.
- [ ] Migration drops body column without data loss; tested by snapshotting before/after.
- [ ] Repo tests updated; `body` field gone from API contracts.

**Phase B runtime:**
- [ ] Reconciler ingests `/workspace/skills/` correctly (test: write a SKILL.md to a temp dir + run reconciler + assert row inserted).
- [ ] Materializer creates symlinks atomically (test: mkdir → reconciler → assert symlink exists, points to canonical).
- [ ] Watcher fires on canonical-path file changes (test: write a file in /workspace/skills/<name>/, expect debounced reload).
- [ ] Frontmatter resync on SKILL.md edit (test: edit description in SKILL.md, expect DB row updated).

**Phase C API:**
- [ ] Upload zip success path (201 + row + files + symlink).
- [ ] Each error path: missing SKILL.md, malformed frontmatter, name collision, size cap exceeded, file count cap, path traversal. **Each cap-exceeded error path also asserts the HTTP request finalizes within 5s (no stall)** — guards against the `unzipper` `entry.autodrain()` gotcha noted in Risks.
- [ ] Per-file GET / PUT / DELETE for dashboard source.
- [ ] Per-file PUT / DELETE returns 403 for zeno_default and profile.
- [ ] Download zip is round-trippable: download → re-upload → assert **content-identical per file** (same paths, same byte content per file). Does NOT assert byte-identical archive — `archiver` and `unzipper` differ on timestamps, compression level, entry order, and that variation is expected and harmless.

**Phase D dashboard:**
- [ ] File tree renders for any skill.
- [ ] Editor saves successfully for dashboard, returns 403 with friendly message for read-only sources.
- [ ] Install modal accepts zip + previews frontmatter.
- [ ] Delete modal cascade preview shows file count + linked connectors + linked crons.

**Quality gate:** 30/30 turbo green; +15 tests minimum.

**E2E (live, against zeno-fn on port 3001):**
- [ ] Build a small real zip (SKILL.md + 1 reference + 1 script). Upload via dashboard. Verify FS state + `skills` row + `~/.claude/skills/` symlink.
- [ ] Trigger a turn that matches the test skill's description in `#C0EXAMPLE000`. Verify worker logs show the skill consulted.
- [ ] Edit a file inline in the dashboard. Verify FS update + reload.
- [ ] Delete the test skill. Verify cascade.

**Branch review (Rule 2 — 3 consecutive clean):**
- [ ] R1, R2, R3 with reset on any BLOCKING.

## Risks / Open Decisions

- **Watcher events on `/workspace/`.** Docker-mounted volumes sometimes have flaky inotify behavior on macOS hosts. Mitigation: rely on debounced polling fallback if `fs.watch` is unreliable; this is already an issue with the current spec 0052 watcher and not introduced here.
- **Symlink semantics in container.** `${claudeHome}/skills/<name>` is a symlink to `/app/agent/skills/<name>` or `/workspace/skills/<name>`. The Claude Agent SDK reads SKILL.md via plain FS calls — symlinks are followed transparently in Node.js's default `fs.readFile`. Verified at implementation time by grep + a quick integration test (Phase B kickoff).
- **One-shot migration writes to `/workspace/skills/` BEFORE the column drops.** Migration ordering: (1) ensure `/workspace/skills/` exists, (2) write each `source='dashboard'` row's body to `/workspace/skills/<name>/SKILL.md`, (3) drop `body` column. If the worker crashes between (2) and (3), reboot is safe — (2) is idempotent, (3) hasn't run yet.
- **What happens if a profile skill and dashboard skill have the same name?** Today this is impossible (`skills.name` is UNIQUE). Stays UNIQUE. Operator can't install a dashboard skill named `fn-code-review` while the profile skill exists. Error: `skill_name_taken`. Workaround for the operator: pick a different name OR delete the profile skill (which only deletes the DB row — the FS file stays since profile mount is read-only — and on next boot reconciler will re-INSERT the profile row, so deleting a profile skill is effectively only-temporary; out-of-scope to fix in v1).
- **Partial zip extraction crashes.** If `extract → validate → rename` is interrupted halfway, we leave a `/workspace/skills/.tmp-<uuid>/` orphan. Boot cleanup task: at worker boot, `rm -rf /workspace/skills/.tmp-*/` before reconciler runs. **Ordering note**: this `cleanupTmpExtractDirs()` MUST run as boot step 1, before the reconciler's safety guard (step 4) checks "is `/workspace/skills/` non-empty?". Without the cleanup-first ordering, a volume containing only `.tmp-*` orphans from a prior crash would pass the guard's "non-empty" check and trigger orphan-deletion of all dashboard skills against an effectively-empty volume. The boot sequence diagram in Architecture (steps 1 → 4) is load-bearing — implementers must NOT reorder.
- **`unzipper` stream gotcha.** When aborting on cap-exceeded, the in-flight `entry` MUST be drained via `entry.autodrain()` before destroying the parent stream — otherwise the upstream HTTP request stalls. Implementer should test the cap-exceeded paths against a real oversized zip to confirm the request finalizes (not hangs).
- **Rollback path.** The `runMigrations` step drops `skills.body`. There is no in-band rollback. To roll back: restore `zeno.db` from a pre-deploy backup (operator's responsibility, documented). The pre-migration script is idempotent so a second deploy of the same image is safe; what's NOT safe is rolling back to the pre-0062 worker image without restoring the DB — without `body` column the old reconciler crashes. Backup recommendation: `cp /workspace/zeno.db /workspace/zeno.db.bak-pre-0062` before the first deploy of this spec.
- **`onSkillsChanged` rewrite.** Today it just logs (line 540-545). After 0061 it calls `materializeSkillsToFs(...)` then logs. No explicit AgentCore reload — SDK rediscovers lazily on next query. Wrap materializer in `try/catch` so a transient FS error doesn't kill the watcher.
- **Dashboard editor for binaries.** Operator uploads a `.png` in a skill — should the dashboard editor open it? v1: file tree shows the file, editor refuses to open binary content (MIME-based detection), shows a "binary, X bytes" placeholder. Operator can replace by re-uploading the zip.
- **Owner-call (Rule 3 synthesis):** Subagent A advocated for FS-based (option C). Subagent B advocated for `skill_files` table (option A). Owner's reply pushed the decision toward the deeper question: **why is the body in DB at all?** The answer is: it shouldn't be. This spec lands on FS-based because the data model wants it, not because of the constitution's "DB single source of truth" framing — that framing was written when skills were single small files and is preserved at the metadata level (`skills` table is still the catalog).

## References

- Spec 0052 (skills v1): `context/specs/2026-04-28-skills/spec.md` — the single-file baseline.
- Spec 0053 (source enum): `context/specs/0053-zeno-default-skills/spec.md` — `zeno_default | profile | dashboard`.
- Spec 0060 (SOUL realign): `context/specs/2026-04-30-soul-skills-realign/spec.md` — fixed the SDK announce.
- Spec 0063 (skill-creator install — next): will use this spec's `/workspace/skills/` writable volume + reconciler.
- Anthropic skill-creator: https://github.com/anthropics/skills/tree/main/skill-creator (multi-file reference).
