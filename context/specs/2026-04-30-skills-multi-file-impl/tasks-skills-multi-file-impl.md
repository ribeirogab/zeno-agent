---
feature: skills-multi-file
plan: "[[plan-skills-multi-file-impl]]"
spec: "[[spec-skills-multi-file-impl]]"
created: 2026-04-30
---
# Spec 0062 — Skills multi-file infrastructure — Tasks

**For this plan:** `[[plan-skills-multi-file-impl]]`

> **Implementer note:** TDD throughout. Every task is "write failing test → minimal impl → green → commit". Run `pnpm run quality-gate` between phases — must stay green. Reference Paper artboards via Paper MCP `get_jsx` / `get_computed_styles` for exact pixel values; do NOT eyeball.

## Phase A — Storage layer

### Task A.1 — Backup recommendation in PR description

- [ ] Note in branch state (PR description draft): operator should run `cp /workspace/zeno.db /workspace/zeno.db.bak-pre-0062` BEFORE first deploy. (No code change.)

### Task A.2 — `Skill` type drop `body` + `rowToSkill` update

- [ ] Open `packages/storage/src/types.ts`, find `Skill` interface, drop the `body: string` field.
- [ ] Open `packages/storage/src/repos/skills.ts`, find `rowToSkill`, drop the `body: row.body` line.
- [ ] Run `pnpm typecheck --filter @zeno/storage` — expect compile errors in `packages/storage` itself + dependent packages. Captures the surface area of the type change.
- [ ] DO NOT commit yet — type drop happens in the same commit as the migration (next task).

### Task A.3 — Migration drops `skills.body` column

- [ ] Open `packages/storage/src/migrations.ts`. Read the existing migrations to understand the format (look at migration 14 which last touched skills).
- [ ] Add migration N (next number after the highest existing): name it `drop_skills_body_column`. SQLite recipe:
  - `BEGIN TRANSACTION`
  - `CREATE TABLE skills_new (id, name, description, source, created_at, updated_at)` with same constraints as current minus `body`
  - `INSERT INTO skills_new (id, name, description, source, created_at, updated_at) SELECT id, name, description, source, created_at, updated_at FROM skills`
  - `DROP TABLE skills`
  - `ALTER TABLE skills_new RENAME TO skills`
  - Recreate any indexes that existed on the old table
  - `COMMIT`
- [ ] Add a migrations test: snapshot the schema before + after, assert `body` is gone, all rows preserved (id + name + source intact).
- [ ] Run `pnpm test --filter @zeno/storage` — expect green.
- [ ] Commit: `feat(storage): drop skills.body — content moves to FS (spec 0062 Phase A)`. **Single commit covers types.ts + repos/skills.ts (rowToSkill) + migrations.ts.**

### Task A.4 — `SkillRepo` constructor takes roots

- [ ] Open `packages/storage/src/repos/skills.ts`. Change constructor:
  ```ts
  constructor(
    private readonly db: DB,
    private readonly roots: {
      agentSkillsRoot: string;
      profileSkillsRoot: string;
      dashboardSkillsRoot: string;
    },
  ) {}
  ```
- [ ] Add method:
  ```ts
  canonicalPath(skill: Skill): string {
    switch (skill.source) {
      case 'zeno_default': return `${this.roots.agentSkillsRoot}/${skill.name}`;
      case 'profile':      return `${this.roots.profileSkillsRoot}/${skill.name}`;
      case 'dashboard':    return `${this.roots.dashboardSkillsRoot}/${skill.name}`;
    }
  }
  ```
- [ ] Add unit test: `canonicalPath` returns correct path for each source given stub roots.
- [ ] Update existing repo tests: every `new SkillRepo(db)` becomes `new SkillRepo(db, { agentSkillsRoot: '/test/agent', profileSkillsRoot: '/test/profile', dashboardSkillsRoot: '/test/dashboard' })`. Find all sites with `grep -rn 'new SkillRepo' packages apps`.
- [ ] Run `pnpm test --filter @zeno/storage` — expect green.
- [ ] DO NOT commit yet — call sites update in next tasks; this task's repo edit is staged but not committed in isolation. **Or** commit now (test-only update) and follow up with worker + API call sites — implementer's choice; either way, the type contract is consistent at every commit boundary because `body` is already gone.

### Task A.5 — Drop `body` from `upsertBySource`, `create`, `update`

- [ ] In `packages/storage/src/repos/skills.ts`:
  - `upsertBySource({ name, description, body, source })` → `upsertBySource({ name, description, source })`. Drop the body INSERT column + parameter. Drop the body update from the ON CONFLICT clause.
  - `create(input)` — input type loses `body`. Drop the body INSERT column.
  - `update(id, patch)` — patch type loses `body`. Drop the body assignment in the SQL.
- [ ] Update tests in `packages/storage/tests/skills.test.ts` — drop every `body: '...'` argument and every `expect(skill.body).toBe(...)` assertion. Replace with assertions on the metadata that survives.
- [ ] Run `pnpm test --filter @zeno/storage` — expect green.
- [ ] Commit: `feat(storage): SkillRepo loses body from CRUD methods (spec 0062 Phase A)`.

### Task A.6 — Quality gate checkpoint

- [ ] Run `pnpm run quality-gate`. Storage package green; dependent packages (worker, API) will fail typecheck — that's expected because their call sites haven't been updated yet. Verify the failure mode is "expected types changed", not surprise breakage.

## Phase B — Worker runtime

### Task B.1 — `cleanupTmpExtractDirs` in materializer

- [ ] Open `apps/worker/src/skills/materialize.ts`. Add at top:
  ```ts
  export async function cleanupTmpExtractDirs(dashboardSkillsRoot: string): Promise<void> {
    if (!existsSync(dashboardSkillsRoot)) return;
    const entries = await fs.readdir(dashboardSkillsRoot);
    for (const entry of entries) {
      if (entry.startsWith('.tmp-')) {
        await fs.rm(`${dashboardSkillsRoot}/${entry}`, { recursive: true, force: true });
      }
    }
  }
  ```
- [ ] Add test: create a tmp dir with `.tmp-foo/` and `bar/` children; call `cleanupTmpExtractDirs`; assert `.tmp-foo` gone, `bar` remains.
- [ ] Run `pnpm test --filter @zeno/worker -- --testPathPattern=materialize`.

### Task B.2 — `materializeSkillsToFs` rewrite as symlink-based

- [ ] Replace the file-write strategy with symlink. For each skill in DB:
  ```ts
  const target = skillRepo.canonicalPath(skill);
  const link = `${claudeHome}/skills/${skill.name}`;
  const tmpLink = `${claudeHome}/skills/.tmp-${skill.name}`;
  // remove existing link/dir at the final path first
  await fs.rm(link, { recursive: true, force: true });
  await fs.symlink(target, tmpLink);
  await fs.rename(tmpLink, link);
  ```
- [ ] Orphan symlink cleanup: read entries in `${claudeHome}/skills/`, any entry whose name doesn't match a DB skill row is removed.
- [ ] Update existing tests: assert symlink exists at `${claudeHome}/skills/<name>`, points to canonicalPath. Drop assertions about file content at that path (it's no longer a file).
- [ ] Add test: create a stale symlink at `${claudeHome}/skills/orphan` pointing somewhere; run materializer; assert orphan removed.
- [ ] Run `pnpm test --filter @zeno/worker -- --testPathPattern=materialize`. Expect green.

### Task B.3 — `bootSkillsReconcile` extends to `/workspace/skills/`

- [ ] Open `apps/worker/src/skills/seed.ts`. Find `bootSkillsReconcile`. Add a 3rd scan root: `dashboardSkillsRoot` (= `/workspace/skills`).
- [ ] For each subdir of `dashboardSkillsRoot`, parse `<name>/SKILL.md` frontmatter, UPSERT the row with `source='dashboard'`.
- [ ] **Orphan cleanup with safety guard**: `dashboard`-source rows whose canonical FS dir is missing get DELETED — but only if `dashboardSkillsRoot` exists AND contains at least one `<name>/SKILL.md`. Otherwise emit WARN and skip the delete.
- [ ] Update `readSkillFile` in seed.ts: drop `body` from the `ParsedSkill` return type.
- [ ] Update worker tests to cover: install dashboard skill (write SKILL.md to /workspace/skills/<name>/, run reconciler, assert row inserted); orphan-cleanup safety guard (DB has dashboard row but /workspace/skills/ is empty → warn + skip, do NOT delete row).
- [ ] Run `pnpm test --filter @zeno/worker -- --testPathPattern=seed`. Expect green.

### Task B.4 — Pre-migration script `migrate-bodies-to-fs.ts`

- [ ] Create `apps/worker/src/skills/migrate-bodies-to-fs.ts`:
  ```ts
  export async function preMigrateBodiesToFs(
    db: DB,
    agentSkillsRoot: string,
    profileSkillsRoot: string,
    dashboardSkillsRoot: string,
  ): Promise<void> {
    // PRAGMA guard
    const cols = db.prepare('PRAGMA table_info(skills)').all();
    if (!cols.some(c => c.name === 'body')) return; // already migrated
    // For each row with body still present:
    //   if source='dashboard': write body to dashboardSkillsRoot/<name>/SKILL.md (idempotent)
    //   if source='profile': diff DB body vs FS; if diverged, write DB body to dashboardSkillsRoot
    //                       AND flip source to 'dashboard'. Name collision protection: skip + WARN.
    //   if source='zeno_default': if diverged, trust FS (no-op); WARN.
    // ...
  }
  ```
- [ ] Tests: 4 scenarios (dashboard write, profile diverged → flip, profile-with-dashboard-name-collision → skip, zeno_default diverged → trust FS). Each scenario verifies idempotency (run twice, no-op the second time).
- [ ] Run `pnpm test --filter @zeno/worker -- --testPathPattern=migrate-bodies`. Expect green.

### Task B.5 — `ProfileWatcher` rename + classify extension

- [ ] Open `apps/worker/src/profile/watcher.ts`.
- [ ] Rename `skillsPath` → `dashboardSkillsPath` in: option type, constructor, internal field, watch loop. SourceKind union stays as `'agent' | 'profile' | 'skills'` — only the prop name changes.
- [ ] Extend `classify(source, filename)`:
  - `source === 'agent' && filename.startsWith('skills/')` → `'skills'`
  - `source === 'profile' && filename.startsWith('skills/')` → `'skills'`
  - All other cases unchanged (SOUL.md → 'prompt', config.yaml → 'crons', etc.)
- [ ] Add the 4 unit-test cases from the spec:
  - `classify('agent', 'skills/zeno-development/SKILL.md')` → `'skills'`
  - `classify('profile', 'skills/fn-code-review/references/foo.md')` → `'skills'`
  - `classify('agent', 'SOUL.md')` → `'prompt'`
  - `classify('profile', 'config.yaml')` → `'crons'`
- [ ] **macOS watcher fallback**: in the `fs.watch` event handler, if `filename` is null or absolute, resolve against the matching watched root to derive `(source, relativePath)` then call `classify`. Add a comment with the same example signatures so future readers see why.
- [ ] Run `pnpm test --filter @zeno/worker -- --testPathPattern=watcher`. Expect green.

### Task B.6 — `apps/worker/src/index.ts` boot sequence wiring

- [ ] Open `apps/worker/src/index.ts`.
- [ ] After `const db = openDatabase(dbPath)` (line ~183), BEFORE `runMigrations(db)` (line ~185), add:
  ```ts
  await cleanupTmpExtractDirs(DASHBOARD_SKILLS_ROOT);
  await preMigrateBodiesToFs(db, agentSkillsRoot, profileSkillsRoot, DASHBOARD_SKILLS_ROOT);
  ```
  with `const DASHBOARD_SKILLS_ROOT = '/workspace/skills';` declared near other path constants at top of file.
- [ ] At line ~194, `new SkillRepo(db)` → `new SkillRepo(db, { agentSkillsRoot, profileSkillsRoot, dashboardSkillsRoot: DASHBOARD_SKILLS_ROOT })`.
- [ ] At line ~237 `bootSkillsReconcile(...)` call — pass the new `dashboardSkillsRoot` arg.
- [ ] At line ~243 `materializeSkillsToFs(...)` — switch to `skillRepo.canonicalPath(skill)` for the symlink target (already covered by B.2 implementation).
- [ ] At line ~523 `new ProfileWatcher({ ..., skillsPath })` — rename to `dashboardSkillsPath: DASHBOARD_SKILLS_ROOT`.
- [ ] At line ~540 `onSkillsChanged` — replace the log-only no-op with `try { await materializeSkillsToFs(skillRepo, claudeHome); } catch (err) { logger.warn({ err }, 'materialize on watcher event failed'); }`. Keep the log line below for observability.
- [ ] Run `pnpm typecheck --filter @zeno/worker`. Expect green.
- [ ] Commit: `feat(worker): symlink-based materializer + reconciler /workspace/skills/ + watcher rename + classify extension (spec 0062 Phase B)`.

### Task B.7 — Quality gate checkpoint

- [ ] Run `pnpm run quality-gate`. Storage + worker green; API still fails typecheck — expected.

## Phase C — API

### Task C.1 — Add `unzipper` dep

- [ ] `pnpm add unzipper --filter @zeno/api`
- [ ] `pnpm add -D @types/unzipper --filter @zeno/api`
- [ ] Verify `apps/api/package.json` lists both. Commit lockfile.

### Task C.2 — `lib/skill-zip.ts` streaming extract + caps

- [ ] Create `apps/api/src/lib/skill-zip.ts`:
  ```ts
  export interface ExtractResult {
    extractedPath: string; // /workspace/skills/.tmp-<uuid>/
    fileCount: number;
    totalBytes: number;
  }
  export type ExtractError =
    | { code: 'skill_size_exceeded'; uploadedBytes: number; cap: number }
    | { code: 'skill_file_too_large'; path: string; sizeBytes: number; cap: number }
    | { code: 'skill_too_many_files'; count: number; cap: number }
    | { code: 'skill_path_invalid'; path: string };

  export async function extractZipWithCaps(
    stream: Readable,
    dashboardSkillsRoot: string,
    caps = { perFile: 1_000_000, total: 5_000_000, maxFiles: 500, hardAbortTotal: 10_000_000 },
  ): Promise<ExtractResult | ExtractError> { ... }
  ```
  Pipeline: `unzipper.Parse()`, per-entry path safety check, write to `${tmpDir}/<entry.path>` while accumulating size counters; abort + `entry.autodrain()` on cap exceeded.
- [ ] Tests with fixture zips:
  - happy path: 3-file zip → success, returns extractedPath
  - per-file cap: a 2 MB single file → error `skill_file_too_large` + tmp dir cleaned + request finalizes within 5s
  - total cap: 6 × 1 MB files → error `skill_size_exceeded` + cleaned + finalizes
  - file count cap: 501 small files → error `skill_too_many_files`
  - path traversal: zip with `../etc/passwd` → error `skill_path_invalid`
  - absolute path: zip with `/usr/bin/x` → error `skill_path_invalid`
- [ ] Run `pnpm test --filter @zeno/api -- --testPathPattern=skill-zip`. Expect green.

### Task C.3 — `POST /api/skills` zip pipeline

- [ ] Open `apps/api/src/routes/skills.ts`. Find existing POST handler.
- [ ] Rewrite: accept `multipart/form-data` with field `file`. Pipeline:
  ```
  await extractZipWithCaps(...) → ExtractResult | ExtractError
    error → cleanup tmpDir, return 4xx with { error: code, message?: ... }
    success → validate SKILL.md exists, parse frontmatter, name kebab-case, name UNIQUE in DB
      validation error → cleanup, return 4xx (skill_frontmatter_missing | skill_name_taken)
      ok → fs.rename(extractedPath, /workspace/skills/<name>/) [atomic]
        → INSERT skills (id, name, description, source='dashboard')
        → return 201 { id, name, description, source }
  ```
- [ ] Update existing POST tests in `apps/api/tests/routes/skills.test.ts`:
  - happy path: small valid zip → 201, row in DB, files at canonical path
  - each error path: assert error code and that no DB row was created and no FS dir remains
- [ ] Run `pnpm test --filter @zeno/api -- --testPathPattern=skills`. Expect green.

### Task C.4 — `GET /api/skills/:id/files` endpoint

- [ ] Add handler: read canonical path via `skillRepo.canonicalPath(skill)`, walk recursively, return `Array<{ path: string, sizeBytes: number, mimeType: string }>`. 404 if skill not found. Skip dotfiles. Path is relative to canonical root (no leading `/`).
- [ ] Tests: empty skill (just SKILL.md) → 1 entry; multi-file skill → correct tree; missing skill → 404.

### Task C.5 — `GET /api/skills/:id/files/:path` (read single file)

- [ ] Add handler: `decodeURIComponent(:path)`, reject `..` and absolute, resolve against canonical, stream the file. `Content-Type` from MIME inference. 404 if file missing.
- [ ] Tests: read SKILL.md; read `references/foo.md` (encoded as `references%2Ffoo.md`); reject `../etc/passwd`; reject `/etc/passwd`; 404 for missing path.

### Task C.6 — `PUT /api/skills/:id/files/:path` (write/replace single file)

- [ ] Add handler: same path safety as C.5. Reject if `skill.source !== 'dashboard'` → 403 `skill_source_immutable`. Write body via `fs.writeFile`. If decoded path === `'SKILL.md'`, re-parse frontmatter and UPDATE `skills.description` if changed.
- [ ] Body size cap: 1 MB. Beyond that → 413 with `skill_file_too_large`.
- [ ] Tests:
  - PUT SKILL.md changes description in DB
  - PUT references/foo.md updates file content on disk
  - PUT for source='zeno_default' → 403
  - PUT for source='profile' → 403
  - PUT 1.1 MB body → 413

### Task C.7 — `DELETE /api/skills/:id/files/:path` (remove single file)

- [ ] Add handler: same path safety. Reject SKILL.md deletion → 422 `skill_md_required`. Reject non-dashboard → 403. `fs.unlink`.
- [ ] Tests: delete a regular file; reject SKILL.md; reject non-dashboard.

### Task C.8 — `GET /api/skills/:id/download` rewrite as zip

- [ ] **Pre-implementation grep** (run from repo root, capture output for the commit message):
  ```
  grep -rE 'skills/[^/]+/download|/api/skills/[^/]+/download' apps/dashboard apps/api/tests tmp
  ```
  Expected: only the dashboard's `<a href="/api/skills/${s.id}/download">` and the existing API tests at `tests/routes/skills.test.ts` lines 407-436. Anything else → STOP and notify operator before flipping the response shape.
- [ ] Replace existing handler: read canonical path, build a zip stream via `archiver`, set `Content-Type: application/zip`, stream response. Works for all sources.
- [ ] Tests: download a skill, parse the zip in-memory, assert all files present with correct content.

### Task C.9 — `GET /api/skills/download-all` adjust for multi-file shape

- [ ] Update existing handler: each skill becomes a `<name>/` sub-directory inside the parent archive. Iterate skills, for each call the same internal helper that powers C.8.
- [ ] Update existing tests at lines 428-436 of `apps/api/tests/routes/skills.test.ts` — assert sub-directory layout.

### Task C.10 — `GET /api/skills/:id` aggregate fields

- [ ] Extend `SkillsRouteDeps` interface in routes/skills.ts:
  ```ts
  interface SkillsRouteDeps {
    skillRepo: SkillRepo;
    connectorSkillRepo: ConnectorSkillRepo;
    cronSkillRepo: CronSkillRepo;
    // (claudeHome removed — see Task C.13)
  }
  ```
- [ ] Update `GET /:id` handler: response shape gains `connectorSkillsCount: number` and `cronSkillsCount: number`. Drop `body` from response (already true after Phase A type change, but verify).
- [ ] Wire repos through `apps/api/src/server.ts`: pass `connectorSkillRepo`, `cronSkillRepo` into `buildSkillsRoute`. Don't pass `claudeHome` anymore.
- [ ] Update tests for GET /:id — assert new fields present.

### Task C.11 — `PATCH /api/skills/:id` description-only + 403 for profile

- [ ] Existing handler: ensure body validation rejects any field other than `description`. Add a 403 `skill_source_immutable` for `source === 'profile'` (matches the existing block on `zeno_default`).
- [ ] Tests: PATCH dashboard → 200 + description updated; PATCH zeno_default → 403; PATCH profile → 403.

### Task C.12 — `DELETE /api/skills/:id` cascade FS cleanup

- [ ] Existing handler: after `DELETE FROM skills WHERE id = ?` (which cascades connector_skills + cron_skills via FK), if `source === 'dashboard'`, `rm -rf canonicalPath`. zeno_default + profile: leave canonical FS alone.
- [ ] Tests: DELETE dashboard → row gone + FS gone; DELETE profile → row gone + FS intact.

### Task C.13 — Remove dead helpers + `claudeHome` from SkillsRouteDeps

- [ ] In `apps/api/src/routes/skills.ts`, DELETE the functions: `recompose`, `writeSkillToFs`, `deleteSkillFromFs`. Drop `claudeHome` field from `SkillsRouteDeps`. Drop the `claudeHome` parameter from `buildSkillsRoute` call in `apps/api/src/server.ts`.
- [ ] Run `pnpm typecheck --filter @zeno/api`. Expect green.
- [ ] Commit: `feat(api): zip install + file CRUD + download zip + aggregate counts; remove body/recompose/claudeHome (spec 0062 Phase C)`. Include the grep output from C.8 in the commit body.

### Task C.14 — Quality gate checkpoint

- [ ] `pnpm run quality-gate`. Storage + worker + API green. Dashboard still uses `body` in the detail page → expected typecheck failure on dashboard.

## Phase D — Dashboard

### Task D.1 — Add `fflate` dep

- [ ] `pnpm add fflate --filter @zeno/dashboard`
- [ ] Verify `apps/dashboard/package.json` lists it. Commit lockfile.

### Task D.2 — `<SkillSourcePill>` component

- [ ] Create `apps/dashboard/src/components/skills/skill-source-pill.tsx`:
  ```tsx
  type Source = 'dashboard' | 'zeno_default' | 'profile';
  export function SkillSourcePill({ source }: { source: Source }) {
    // 3 variants with locked palette tokens — see Paper artboards 6JK-0, 6OQ-0
  }
  ```
  Style tokens (from spec 0061 tasks.md locked palette):
  - dashboard → bg `#1B1F2E`, border `#2A2F45`, text `#8A8FAB`, dot `#8A8FAB`
  - zeno_default → bg `#D9B3621A`, border `#D9B36247`, text `#D9B362`, dot `#D9B362`
  - profile → bg `#7AA6E81A`, border `#7AA6E847`, text `#7AA6E8`, dot `#7AA6E8`
- [ ] Snapshot test for each of the 3 variants.

### Task D.3 — `<SkillFileTree>` component

- [ ] Create `apps/dashboard/src/components/skills/skill-file-tree.tsx`. Props: `files: Array<{ path: string; sizeBytes: number; mimeType: string }>`, `selectedPath: string`, `onSelect: (path: string) => void`. Renders flat array as collapsible tree. Default-open folders: `references/`, `scripts/`, `examples/`, `templates/`. Selected row = bg `#D9B3621A` + 2px gold left border. Chevrons + dots in 10×10 fixed-width slots (`flexShrink: 0`).
- [ ] Test: renders the artboard's 6JK-0 skill-creator layout from a fixture; collapsing `references/` hides children; clicking `apis.md` fires onSelect.

### Task D.4 — `<SkillFileEditor>` component

- [ ] Create `apps/dashboard/src/components/skills/skill-file-editor.tsx`. Props: `skill: Skill`, `path: string`, `content: string`, `onSave: (content: string) => void`. For `source === 'dashboard'`: editable textarea + enabled gold Save button. For other sources: read-only textarea + disabled Save button (bg `#1B1F2E`, opacity 0.4, tooltip "read-only — edit on the host"). Footer-left helper text branches on source per spec.
- [ ] Test: dashboard source → save fires PUT; zeno_default → save button disabled; profile → save button disabled.

### Task D.5 — `<InstallErrorBanner>` component

- [ ] Create `apps/dashboard/src/components/skills/install-error-banner.tsx`. Props: `code: 'skill_frontmatter_missing' | 'skill_name_taken' | 'skill_size_exceeded' | 'skill_file_too_large' | 'skill_path_invalid'`, `detail?: { ... }`. Renders the red banner from artboard `6WK-0` with copy + icon per variant.
- [ ] Test: each error code renders the expected heading + body.

### Task D.6 — `<DeleteReseedCallout>` component

- [ ] Create `apps/dashboard/src/components/skills/delete-reseed-callout.tsx`. Props: `skillName: string`, `profileName: string`, `hostPath: string`. Renders the yellow callout from artboard `72Y-0`: bg `#D9B36214`, border `#D9B36247`, gold warning triangle, heading + paragraph + dashed-separator + footer line.
- [ ] Test: snapshot test from a fixture.

### Task D.7 — `<DeleteSkillModalDashboard>` component

- [ ] Create `apps/dashboard/src/components/skills/delete-skill-modal-dashboard.tsx`. Props: `skill`, `fileCount`, `connectorSkills`, `cronSkills`. Renders artboard `71K-0`: rounded shell, destructive kicker, h2, body, CASCADE PREVIEW with 3 bullets + reassurance line, type-to-confirm input gated by name match, footer with Cancel + destructive Delete button. Submits → `DELETE /api/skills/:id` mutation with the invalidation strategy from spec.
- [ ] Test: type-to-confirm gates submit; bullets render correct counts.

### Task D.8 — `<DeleteSkillModalProfile>` component

- [ ] Create `apps/dashboard/src/components/skills/delete-skill-modal-profile.tsx`. Same shell as D.7 with: source pill (cyan), `<DeleteReseedCallout>` above cascade card, profile-specific bullets + reassurance ("host dir stays untouched"), footer-left text "↳ reseed unless host dir removed".
- [ ] Test: callout renders; bullets reflect profile copy.

### Task D.9 — Install modal rewrite for zip + preview via fflate

- [ ] Open `apps/dashboard/src/components/skills/install-skill-modal.tsx`. Rewrite:
  - File input accepts `.zip` (was `.md`).
  - On file pick: `arrayBuffer = await file.arrayBuffer()`; `unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer))`; locate `SKILL.md`; parse frontmatter.
  - Render the success preview (artboard `6UD-0`): file picker block (green if valid), EXTRACTED PREVIEW card with name/desc/files/top-level/source rows + `<SkillSourcePill source="dashboard" />`, validation note, footer with gold Install button.
  - On POST error: render `<InstallErrorBanner code={error.code} />` + tint file picker red + disable Install button. Map each API error code 1:1.
- [ ] Test: fixture zip with SKILL.md + references/x.md → preview renders; zip without SKILL.md → frontmatter_missing error variant.

### Task D.10 — `/skills/:id` route rewrite

- [ ] Open `apps/dashboard/src/routes/_authed/skills.$id.tsx`. Rewrite:
  - Detail page header (artboard `6JK-0`): icon container + h1 + description + meta line (`installed Xd ago · N files · X KB total`) + `<SkillSourcePill>` + Edit description button (hidden if `source !== 'dashboard'`) + kebab menu.
  - Body grid: `<SkillFileTree>` (left, 280px) + `<SkillFileEditor>` (right, fills).
  - Drop all `s.body` references — use `useFiles(skill.id)` hook for the meta line + tree.
  - Modal selection: kebab → "Delete" → if `source === 'dashboard'` render `<DeleteSkillModalDashboard>`; if `source === 'profile'` render `<DeleteSkillModalProfile>`; if `source === 'zeno_default'` HIDE the Delete entry entirely.
- [ ] Test: existing tests that read `s.body` are removed/rewritten to assert the new shape (file count, source pill, button visibility).

### Task D.11 — Mutation invalidation in `lib/use-skills.ts`

- [ ] Open `apps/dashboard/src/lib/use-skills.ts`. Update each mutation per the spec's invalidation strategy:
  - POST → `qc.invalidateQueries({ queryKey: ['skills'] })`
  - PUT files/:path → invalidate `['skills', id, 'files']` (+ `['skills', id]` if path === `'SKILL.md'`)
  - DELETE files/:path → invalidate `['skills', id, 'files']`
  - PATCH /:id → invalidate `['skills', id]` AND `['skills']`
  - DELETE /:id → remove `['skills', id]` + `['skills', id, 'files']`, then invalidate `['skills']`
- [ ] Smoke-test in dashboard: install a skill from the modal, verify list refreshes without F5.

### Task D.12 — Quality gate checkpoint

- [ ] `pnpm run quality-gate`. Expect 30/30 turbo green.
- [ ] Commit: `feat(dashboard): file tree + editor + zip install + delete cascade modals (spec 0062 Phase D)`.

## Phase E — Quality gate + E2E

### Task E.1 — Full quality gate

- [ ] `pnpm run quality-gate`. All workspaces green. Test count delta ≥ +15. Document the test count + delta in the PR body.

### Task E.2 — Docker rebuild

- [ ] `pnpm run docker:build` (default profile). Verify image builds clean.
- [ ] `PROFILE=fn pnpm run docker:up -d` against the existing zeno-fn container. Or restart the running container if already up: `PROFILE=fn pnpm run docker:down && PROFILE=fn pnpm run docker:up -d`.
- [ ] Tail logs: `PROFILE=fn pnpm run docker:logs` for ~30 seconds. Verify boot sequence completes without error: cleanup → preMigrate → runMigrations → reconcile → materialize → ProfileWatcher.start.

### Task E.3 — Build the test zip

- [ ] In `tmp/`, create a small skill bundle:
  ```
  tmp/test-skill/
    SKILL.md         (frontmatter: name=spec-0062-smoke, description=Test skill for spec 0062 e2e)
    references/foo.md
    scripts/helper.sh
  ```
- [ ] Zip it: `cd tmp && zip -r test-skill.zip test-skill/`. Result: `tmp/test-skill.zip`.

### Task E.4 — Install via dashboard

- [ ] Browser: dashboard at http://localhost:3000 → /skills → "Install skill" → drag in `tmp/test-skill.zip`. Expect: success preview matching artboard `6UD-0` (file picker green, EXTRACTED PREVIEW shows name/desc/files/top-level/source). Click Install.
- [ ] Verify: 201 in network tab; row in `skills` table (check via dashboard list); files at `/workspace/skills/spec-0062-smoke/` inside container; symlink at `~/.claude/skills/spec-0062-smoke` → `/workspace/skills/spec-0062-smoke`.
- [ ] Worker logs: `event: 'skills_reloaded'` (watcher) + `event: 'skills_materialized'` (materializer) — both must appear.

### Task E.5 — Slack smoke

- [ ] In Slack channel `#C0EXAMPLE000` (https://acme.slack.com/archives/C0EXAMPLE000), send a message that triggers the test skill: e.g., `@zeno-agent run the spec-0062-smoke skill on this thread`.
- [ ] Verify in worker logs: agent reads the SKILL.md (look for `Read` of `~/.claude/skills/spec-0062-smoke/SKILL.md` or a `Skill` tool invocation by name).

### Task E.6 — Inline edit smoke

- [ ] Dashboard: navigate to `/skills/spec-0062-smoke`. Click `references/foo.md` in the tree. Edit content. Save.
- [ ] Verify: PUT 204 in network; file content updated on disk (`docker exec zeno-fn cat /workspace/skills/spec-0062-smoke/references/foo.md`); watcher fired (`event: 'skills_reloaded'` in logs).

### Task E.7 — Download zip round-trip

- [ ] Click Download in the kebab menu. Save the zip locally.
- [ ] Verify content-type `application/zip`. Unzip; confirm `SKILL.md`, `references/foo.md`, `scripts/helper.sh` all present with same content as uploaded.

### Task E.8 — Delete cascade smoke (dashboard)

- [ ] Dashboard: kebab → Delete. Modal renders artboard `71K-0` (cascade preview with file count from /files; connector + cron rows = 0 since smoke skill is unlinked).
- [ ] Type `spec-0062-smoke` in confirm input; click Delete.
- [ ] Verify: row gone, FS gone (`docker exec zeno-fn ls /workspace/skills/` → no `spec-0062-smoke` dir), symlink gone (`docker exec zeno-fn ls ~/.claude/skills/`).

### Task E.9 — Regression smoke for existing skills

- [ ] Verify the existing zeno_default skills (e.g., zeno-development) still load: dashboard `/skills` shows them; `/skills/zeno-development` renders read-only with cyan/gold pill correctly; Save button disabled with tooltip.
- [ ] Mention `@zeno-agent` in `#C0EXAMPLE000` with a request that exercises an existing skill (e.g., a zeno-development-typed prompt). Verify the agent invokes the skill.

### Task E.10 — Profile reseed delete smoke

- [ ] Dashboard: navigate to a profile-source skill (e.g., `fn-code-review`). Open Delete from kebab. Modal renders artboard `72Y-0` (yellow reseed callout above cascade card, profile bullet copy).
- [ ] Type `fn-code-review`; click Delete. Row deleted from DB. Symlink removed.
- [ ] Restart container (`PROFILE=fn pnpm run docker:down && PROFILE=fn pnpm run docker:up -d`). Verify row re-INSERTed by reconciler (proving the reseed warning is correct).

## Final review (Rule 2 from cleanup contract)

- [ ] **R-final-1**: re-read every changed file vs the spec. Note any drift. If found: fix and reset counter.
- [ ] **R-final-2**: run `pnpm run quality-gate` and `git diff main...HEAD` end-to-end review for compile-only warnings, missed `body` references, etc. Reset on findings.
- [ ] **R-final-3**: deploy-target sanity — verify the running zeno-fn container after `docker:up` boots cleanly with the new image (cleanup → preMigrate → migrations → reconcile → materialize → watcher all in logs, no errors). Reset on findings.

## PR

- [ ] Use `/open-pr`. Title: `feat: skills multi-file infrastructure (spec 0062)`. Body should include:
  - Summary of the 5 phases
  - Test count delta
  - Reference to `context/specs/2026-04-30-skills-multi-file-impl/spec.md`
  - Backup recommendation: `cp /workspace/zeno.db /workspace/zeno.db.bak-pre-0062` BEFORE first deploy
  - The grep output from C.8 (download endpoint callers)
  - Paper artboard IDs from spec 0061 used as visual contract (6JK-0, 6OQ-0, 6UD-0, 6WK-0, 71K-0, 72Y-0)
