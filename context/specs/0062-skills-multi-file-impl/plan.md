---
feature: skills-multi-file
spec: "[[spec]]"
created: 2026-04-30
---
# Spec 0062 — Skills multi-file infrastructure — Plan

**For this spec:** `[[spec]]`

## Approach

The skills feature shifts from "one SKILL.md body in a SQLite TEXT column" to "a directory tree on disk + DB metadata only". The data wants this — Anthropic's reference catalog (which spec 0063 will install) is built around multi-file skills (SKILL.md + references/ + scripts/ + examples/). Trying to encode that into a single `body` blob fights every grep, every import, every materializer pass.

The work sequences **storage → worker runtime → API → dashboard → quality gate**. Storage lands first because it changes the type contract that every other layer consumes — Skill loses `body`, gains `canonicalPath()`. Worker runtime second: the reconciler must learn to scan `/workspace/skills/`, the materializer flips from file-write to symlink, and the watcher renames `skillsPath → dashboardSkillsPath` plus extends `classify` to also fire on `agent/skills/*` and `profile/skills/*` sub-paths. API third: `POST /api/skills` becomes a streaming zip extractor with cap-gated abort, plus 4 new file-CRUD endpoints and a download-as-zip rewrite. Dashboard last: rewrite `/skills/:id` as file-tree + editor matching the locked Paper artboards (`6JK-0`, `6OQ-0`, `6UD-0`, `6WK-0`, `71K-0`, `72Y-0`) — pixel-for-pixel via `get_jsx` / `get_computed_styles` rather than eyeballing.

The Paper artboards from spec 0061 lock the visual contract. Phase D's task list is structured around component-per-artboard rather than feature-per-route — a single `<SkillSourcePill />` reused across detail header, install modal preview, and both delete modals; each install error variant maps 1:1 to an API error code; the `<DeleteReseedCallout />` is its own file because spec 0063's hot-install pipeline will also surface it. TDD throughout. Every API route test follows the existing `apps/api/tests/routes/skills.test.ts` patterns (cookie-signed sessions). The end-to-end Slack install is exercised against the running `zeno-fn` container after Phase E.

The spec landed after 11 brainstorm rounds + 4 implementation review rounds (R1 fixed 7 BLOCKING; R2 / R3 / R4 all APPROVED — 3-clean streak achieved). Storage shape decision (FS canonical, DB metadata only) was owner-locked after a parallel-subagent debate where one subagent argued for `skill_files` table and the other for FS-based; the data model decided (200-file skills don't belong in SQL).

## Architecture

### File structure

```
packages/storage/src/
├── migrations.ts                                 # +migration N: drop skills.body via SQLite recreate-and-copy
├── repos/skills.ts                               # ctor takes {agentSkillsRoot, profileSkillsRoot, dashboardSkillsRoot}
│                                                 # +canonicalPath(skill); -body from update/upsertBySource/create
├── tests/skills.test.ts                          # update — drop all body assertions
└── types.ts                                      # Skill loses `body`; rowToSkill updated

apps/worker/src/
├── skills/
│   ├── migrate-bodies-to-fs.ts                   # NEW: one-shot pre-migration (idempotent via PRAGMA guard)
│   ├── seed.ts                                   # bootSkillsReconcile: +scan /workspace/skills/, drop body
│   │                                             # readSkillFile: drop body from ParsedSkill return
│   └── materialize.ts                            # rewrite as symlink-based (atomic via tmp-symlink + rename)
│                                                 # +cleanupTmpExtractDirs(dashboardSkillsRoot)
├── profile/
│   └── watcher.ts                                # rename skillsPath→dashboardSkillsPath
│                                                 # extend classify: agent/skills/* + profile/skills/* → 'skills'
│                                                 # +macOS fallback: resolve absolute path → root → relative
└── index.ts                                      # boot order: cleanupTmp → preMigrate → runMig → reconcile
                                                  # → materialize → ProfileWatcher.start
                                                  # SkillRepo ctor gets roots; onSkillsChanged calls materializer

apps/api/src/
├── lib/
│   └── skill-zip.ts                              # NEW: streaming extract + caps + path safety + atomic rename
├── routes/skills.ts                              # POST: zip pipeline; +GET /:id/files, GET /PUT /DELETE /:id/files/:path
│                                                 # GET /:id/download: zip stream via archiver (was text/markdown)
│                                                 # GET /:id: +connectorSkillsCount, +cronSkillsCount
│                                                 # PATCH /:id: 403 for profile (was 0052 oversight)
│                                                 # remove recompose, writeSkillToFs, deleteSkillFromFs
│                                                 # remove claudeHome from SkillsRouteDeps
├── server.ts                                     # +connectorSkillRepo, +cronSkillRepo through buildSkillsRoute
│                                                 # -claudeHome from buildSkillsRoute
├── index.ts                                      # SkillRepo ctor: hard-coded /app/agent/skills, /app/profile/skills
└── tests/routes/skills.test.ts                   # +zip success, +4 error variants, +file CRUD, +download zip

apps/dashboard/src/
├── components/skills/
│   ├── skill-source-pill.tsx                     # NEW: 3-variant pill (dashboard/zeno_default/profile)
│   ├── skill-file-tree.tsx                       # NEW: collapsible tree from /files endpoint
│   ├── skill-file-editor.tsx                     # NEW: textarea + read-only/disabled per source
│   ├── skills-install-modal.tsx                  # rewrite: .zip via fflate preview
│   ├── install-error-banner.tsx                  # NEW: 4 variants, discriminated on API error code
│   ├── delete-skill-modal-dashboard.tsx          # NEW: cascade card + type-to-confirm (artboard 71K-0)
│   ├── delete-skill-modal-profile.tsx            # NEW: same shell + reseed callout (72Y-0)
│   └── delete-reseed-callout.tsx                 # NEW: yellow "will be reseeded" banner
├── lib/use-skills.ts                             # update: query keys, mutation invalidation per spec
└── routes/_authed/
    └── skills.$id.tsx                            # rewrite: file tree + editor + meta line + branched modal

context/specs/0062-skills-multi-file-impl/
├── spec.md                                       # written, R4-clean
├── plan.md                                       # this file
└── tasks.md                                      # next file
```

### Boot sequence (after this spec ships)

```
apps/worker/src/index.ts:

1. cleanupTmpExtractDirs(/workspace/skills)        — rm -rf .tmp-* orphans before anything reads the dir
2. preMigrateBodiesToFs(db, agentSkillsRoot,       — guarded by PRAGMA: skip if `body` column already gone
   profileSkillsRoot, dashboardSkillsRoot)         — write each dashboard row's body to FS;
                                                     diverged profile rows → flip source to 'dashboard'
3. runMigrations(db)                               — SQLite migration drops skills.body
4. bootSkillsReconcile(skillRepo, agent, profile,  — UPSERT zeno_default (image), profile (mount),
   dashboard) — orphan-cleanup safety guard:        dashboard (workspace volume); DELETE dashboard rows
   /workspace/skills/ must exist AND be non-empty   whose canonical FS dir is missing
5. materializeSkillsToFs(skillRepo, claudeHome)    — symlink ~/.claude/skills/<name> → canonicalPath
                                                     atomic via tmp-symlink + rename
6. ProfileWatcher.start({ agent, profile,           — watches 3 roots; classify dispatches by source
   dashboardSkillsPath: /workspace/skills })          + filename prefix
   onSkillsChanged → materializeSkillsToFs(...)    — wrap in try/catch
```

### Data flow at install (dashboard zip upload)

```
multipart POST /api/skills (file=<...>.zip)
  ↓ unzipper.Parse() streams entries to /workspace/skills/.tmp-<uuid>/
  ↓   per-entry size guard (1 MB cap, abort + autodrain)
  ↓   running total cap (5 MB hard, 10 MB safety margin)
  ↓   path safety per entry (no .., no absolute, no symlinks)
  ↓ validate: SKILL.md exists at root, frontmatter parses, name kebab-case + UNIQUE
  ↓ rename .tmp-<uuid> → /workspace/skills/<name>  [atomic]
  ↓ INSERT skills (id, name, description, source='dashboard')
  ↓ ProfileWatcher fires on FS create event
  ↓ materializeSkillsToFs creates ~/.claude/skills/<name> → /workspace/skills/<name>
  ↓ SDK auto-discovers on next agent query (lazy)
  ↓ 201 { id, name, description, source }
```

### Data flow at delete (dashboard source)

```
DELETE /api/skills/:id
  ↓ load row, capture { source, name, canonicalPath }
  ↓ DELETE FROM skills WHERE id = ?  [cascades connector_skills, cron_skills]
  ↓ if source='dashboard': rm -rf canonicalPath
  ↓   if source='profile': leave FS (read-only mount); next reconciler boot re-INSERTs
  ↓   if source='zeno_default': delete affordance hidden in dashboard (Non-Goal)
  ↓ ProfileWatcher fires on FS dir removal
  ↓ materializeSkillsToFs removes the symlink ~/.claude/skills/<name>
  ↓ 204
```

## Phase Ordering

The five phases ship strictly in order. Each commit inside a phase is bite-sized. TDD: write failing test → minimal impl → green test → commit.

| Phase | Owns | Depends on |
|---|---|---|
| **A** Storage | migration + repo + types + tests | (nothing — drives the contract) |
| **B** Worker runtime | reconciler + materializer + watcher | Phase A (consumes new repo + types) |
| **C** API | zip pipeline + file CRUD + download | Phase A (repo) + Phase B (FS layout) |
| **D** Dashboard | components + routes + invalidation | Phase A (repo response shapes) + Phase C (endpoints) |
| **E** Quality gate + E2E | turbo green + Slack smoke | Phases A–D done |

A and B can land in the same commit if the implementer prefers (they share the type drop), but separating reduces blast radius.

Each phase ends with a `pnpm run quality-gate` checkpoint — turbo must stay green between phases. If any phase breaks the gate, the implementer pauses and either fixes forward or reverts. **No phase is `done` until quality-gate is green.**

## Risks / Open Decisions

(Plan-level risks — spec-level risks live in the spec.)

- **Plan size.** This is a 5-phase, 4-file-cluster, +15-test spec. The implementer should resist the urge to land it as one mega-PR — the 3-clean review pass at the end will be unwieldy. **Strategy: one PR for this branch, but commit-by-commit ergonomics matter.** Keep commits ≤ ~300 LOC of meaningful diff so the final review can spot-check by commit. The 5-phase ordering already enforces this naturally.

- **Migration timing on the running `zeno-fn` container.** The pre-migration script is idempotent and the runMigrations step is one-shot. The order is: cleanup → preMigrate → runMig → reconcile. If the worker crashes mid-preMigrate (between writing some bodies but not all), reboot is safe — it picks up where it left off. If it crashes mid-runMigrations (rare; SQLite transaction semantics protect us), the migration is rolled back and we're at status quo ante. Backup recommendation lives in the spec; the plan adds: **operator runs `cp /workspace/zeno.db /workspace/zeno.db.bak-pre-0062` BEFORE the first deploy**, documented in the PR description.

- **macOS watcher fallback.** Spec calls for a fallback when `fs.watch(root, { recursive: true })` doesn't deliver the expected `filename` shape. Day-1 requirement on dev machines. The plan allocates this to a Phase B sub-task with a verification step (`tail` worker logs and verify the relative path arrives correctly). If the fallback isn't ergonomic to implement (~10 lines), document the macOS gap in the PR and ship Linux-only — the production target is Docker on Linux anyway, and the dev workflow runs in Docker too.

- **Phase D test count.** The spec says +15 tests minimum for the full suite. Phase D alone adds ~8 of those (4 install error variants, source pill 3 variants, edit-button visibility, delete-modal-profile reseed callout). If Phase D's testing time dominates the PR, the implementer can fold the source-pill snapshot tests into a single parametrized test rather than 3 separate ones — minor convenience.

- **Owner E2E gate.** Per the cleanup contract, after the implementation lands and turbo-greens, the `zeno-fn` container at port 3001 + Slack channel `#C0EXAMPLE000` is the final smoke. Plan reserves Phase E for this; it's a run-not-skip step.
