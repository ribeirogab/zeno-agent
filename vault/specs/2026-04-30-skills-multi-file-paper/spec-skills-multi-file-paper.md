---
status: draft
feature: skills-multi-file-paper
created: 2026-04-30
shipped: null
---
# Spec 0061 — Skills multi-file Paper artboards

**Status:** Draft
**Scope:** Phase 0 Paper-first work for spec 0062 (Skills multi-file infra). Owner-approved artboards in the "Hearty island" Paper file are the gating deliverable before any code in 0062 ships.

## Context

Spec 0062 redesigns three pieces of the Skills UI:
- **Skill detail page** — from a single `<pre>` body block to a file tree + per-file editor
- **Install modal** — from `.md` picker to `.zip` upload with in-browser frontmatter preview (`fflate`)
- **Delete modal** — adds cascade preview (files + connector links + cron links + profile reseed warning)

These are real UI changes that the operator will see and use daily. The project memory `feedback_paper_first_workflow.md` mandates: spec → Paper artboards (approved) → plan → implementation. Skipping Paper risks shipping a wrong-shape UI that takes more cycles to fix than to draw correctly upfront.

This spec is **only the Paper deliverable**. Implementation (DB migration, API endpoints, dashboard React code, runtime materializer/watcher) lives in spec 0062 which depends on this spec's artboards being approved.

## Problem Statement

Three concrete UI risks if we skip Paper:
1. **File tree + editor layout** — multiple sane shapes (left-tree/right-editor, top-tabs/bottom-editor, breadcrumb-only). Picking the wrong one mid-implementation costs a Phase D rewrite.
2. **Install modal frontmatter preview** — what the operator sees AFTER picking a zip but BEFORE clicking Install. Need to lock: which fields render, error states, edge cases (no SKILL.md, malformed frontmatter, oversized).
3. **Delete cascade copy** — the modal needs to communicate the difference between dashboard and profile sources clearly. Profile reseed surprise is documented in spec 0062 Non-Goals; the delete modal is where the operator hits it. Wrong copy → operator confusion → support overhead.

## Non-Goals

- **Out of scope: any code changes.** This spec ships only `.pen` artboards. No `apps/`, `packages/`, or `context/specs/0062-*` edits.
- **Out of scope: redesign of S1 (`/skills` list) or S2 (`/skills` empty).** These are unchanged in spec 0062 — body field removed from rows but layout stays. No new artboard needed.
- **Out of scope: full re-skin of existing primitives.** Reuse existing palette, type, spacing tokens. New components (file tree, file editor) follow the established style.
- **Out of scope: animations or interaction prototypes.** Static artboards only. Hover/focus states are covered by primitive artboards 13-22.
- **Out of scope: dark/light theming.** Dashboard is dark-only today. Same here.
- **Out of scope: empty state of file tree.** v1 always has at least `SKILL.md` (validated at upload). No "no files" state.
- **Out of scope: folder-drag install UX (`webkitdirectory`).** Install is zip-only per spec 0062.
- **Out of scope: deleting the old `M-skill-2 · Edit body` artboard.** Mark it as **superseded** in spec notes; do not delete from Paper. (Historical reference for spec 0052 has value.)

## Constraints

- **Single Paper file**: `zeno-agent` ("Hearty island"). All artboards land in the existing `— SKILLS UI (spec 0052)` band or a new `— SKILLS UI v2 (spec 0061)` band placed below the channels section (~18400px down).
- **Reuse existing primitives**: palette (sidebar/canvas/panel/panel-2 for dark surfaces; gold for accents; status pills), type scale (JetBrains Mono for body labels, Fraunces for h1, Inter for prose), spacing rhythm (gap multiples of 4/8/16/24).
- **Sidebar + topstrip**: clone existing nav + topstrip from C2 or CH1. The skills nav item already exists; no sidebar change needed for this spec.
- **Each artboard is 1440×900** for full-page screens, **800×variable** for modals (matches existing M-* convention). Modal heights use `fit-content` after content settles. **Exception**: destructive confirm dialogs are narrower (520px) — matches existing pattern from CH-3 uninstall (`6FN-0` is 520px). M-skill-4v2 follows that exception.
- **Owner approval gates 0062.** Without a sign-off comment from the owner on each artboard, spec 0062 implementation does not start.
- **Constitution principles**: YAGNI (only the artboards strictly required for spec 0062 scope; no speculative variants), Reversibility (Paper file is revisable; commit after owner approval).

## User Stories / Scenarios

These narrate what each artboard depicts; the artboards themselves are the deliverable.

1. **S3v2 — Skill detail (dashboard source, file tree)**: operator on `/skills/skill-creator` sees header (icon + name + source pill `dashboard` + meta), then a two-column body: left ≈280px file tree (collapsible folders, file icons, selected state highlighted), right fills with a textarea showing the selected file's content + a Save button. Edit-description button at the top. Kebab menu on the right with "Delete skill".

2. **S3v2-readonly — Skill detail (zeno_default / profile, read-only)**: same layout as v1 but the Save button is disabled with a tooltip ("read-only — edit on the host"); source pill says `zeno_default` (gold) or `profile` (dim cyan); Edit-description button is hidden. **Two pill variants on the same artboard**: stack two header rows vertically inside one artboard, one per source type, each row labeled with a small annotation tag (`zeno_default` / `profile`). The body grid (file tree + read-only editor) is shown only once below — operators understand the variation is in the header, not the body.

3. **M-skill-1v2 — Install zip (preview)**: modal with file-picker. After zip selected, preview card renders: skill name (parsed from frontmatter), description, file count, total size, list of top-level paths. Install button enabled. Cancel + Install footer.

4. **M-skill-1c — Install errors**: same modal, four error variants stacked: (a) `skill_frontmatter_missing` (no SKILL.md), (b) `skill_name_taken` (UNIQUE collision), (c) `skill_size_exceeded` / `skill_file_too_large` (cap), (d) `skill_path_invalid` (path traversal). Each variant shows the validation banner replacing the preview card; Install button disabled.

5. **M-skill-4v2 — Delete cascade (dashboard)**: modal "Delete skill-creator?". Cascade preview card lists: "23 files will be removed", "2 connector links will be unlinked", "1 cron link will be unlinked". Type-to-confirm input. Cancel + Delete (destructive) buttons.

6. **M-skill-4v2-profile — Delete cascade (profile reseed warning)**: same modal but for a profile-source skill. Cascade preview adds a yellow callout: "This profile skill will be reseeded on next worker restart unless removed from `profiles/<n>/skills/`. To delete permanently, remove the host directory."

## Success Criteria

**Phase 0 — Paper artboards in `zeno-agent` file:**
- [ ] **Section header** `— SKILLS UI v2 (spec 0061)` added below the channels section (around y=18400 or wherever the next clean band is).
- [ ] **S3v2** — Skill detail (dashboard source, file tree + editor). 1440×900 fit-content.
- [ ] **S3v2-readonly** — Skill detail (zeno_default / profile). 1440×900 fit-content.
- [ ] **M-skill-1v2** — Install zip success preview. 800×fit-content.
- [ ] **M-skill-1c** — Install error states (four variants stacked vertically inside one artboard, OR four separate small artboards — implementer's call at draw time).
- [ ] **M-skill-4v2** — Delete cascade modal (dashboard source). 800×fit-content.
- [ ] **M-skill-4v2-profile** — Delete cascade modal with profile reseed warning. 800×fit-content.
- [ ] **Owner review** in Paper. Changes round-trip until owner approves visually.
- [ ] **Approved artboard IDs captured in spec 0062 plan.md** so the implementer has unambiguous visual references. (plan.md is created during spec 0062's writing-plans phase, which begins ONLY after this Paper spec ships and gets owner approval.)

## Architecture

### Component map

```
zeno-agent.pen (Hearty island file)
└── Page 1
    ├── existing — SKILLS UI (spec 0052) section            # untouched
    └── NEW — SKILLS UI v2 (spec 0061) section
        ├── S3v2 · /skills/<id> (file tree + editor, dashboard)
        ├── S3v2-readonly · /skills/<id> (read-only, profile / zeno_default)
        ├── M-skill-1v2 · Install zip (preview success)
        ├── M-skill-1c · Install errors (four variants)
        ├── M-skill-4v2 · Delete cascade (dashboard)
        └── M-skill-4v2-profile · Delete cascade (profile reseed)

context/specs/2026-04-30-skills-multi-file-paper/  (this spec's home)
├── spec.md                                                 # this file
└── tasks.md                                                # next file (Phase 0 tasks)
```

### Reuse from existing primitives

| Primitive | Source artboard ID | Used in |
|---|---|---|
| Sidebar | clone from C2 (1P9-0) or CH1 (61Q-0) | S3v2 + S3v2-readonly |
| Topstrip + breadcrumb | clone | S3v2 + S3v2-readonly |
| Status pill (source label) | C3 (1XN-0) for `dashboard`, similar for `profile` / `zeno_default` | S3v2 |
| Modal shell + corner brackets | M-skill-1 (5GF-0) and CH-3 (6FN-0) | all M-* |
| Type scale | 06-08 artboards (3R, 40, 4D) | all |
| Buttons (gold primary, outline cancel, destructive) | 13 (8L-0) | all M-* |
| Text inputs / textarea | 14 (9G-0) | M-skill-1v2, S3v2 editor |
| Empty / error banners | 17 (BP-0) | M-skill-1c, M-skill-4v2-profile |

### Layout — S3v2 detail page

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar │ Topstrip: zeno / skills / skill-creator                │
│         ├──────────────────────────────────────────────────────  │
│         │  Header                                                │
│         │  ┌─[icon]─┐  skill-creator  [dashboard pill]  [⋯]      │
│         │  │  56×56 │  Builder for new Anthropic skills          │
│         │  └────────┘  installed 2d ago · 23 files · 412 KB      │
│         │              [✎ Edit description]                      │
│         ├──────────────────────────────────────────────────────  │
│         │  ┌─ Files ────────────┐  ┌─ Editor ──────────────────┐ │
│         │  │ ▾ /                │  │ # Skill Creator           │ │
│         │  │   ▸ SKILL.md  ◀sel │  │                           │ │
│         │  │   ▾ references/    │  │ Use this when…            │ │
│         │  │     ▸ apis.md      │  │                           │ │
│         │  │     ▸ rules.md     │  │ [textarea content]        │ │
│         │  │   ▾ scripts/       │  │                           │ │
│         │  │     ▸ helper.sh    │  │                           │ │
│         │  │   ▾ examples/      │  │                           │ │
│         │  │     ▸ demo.json    │  │                  [💾 Save]│ │
│         │  └────────────────────┘  └───────────────────────────┘ │
│         │  280px wide                fills, max 880              │
└─────────────────────────────────────────────────────────────────┘
```

### Layout — M-skill-1v2 install zip preview

```
┌─ Modal · 800px ────────────────────────────┐
│  install · skill                            │
│  Add skill from zip                         │
│ ─────────────────────────────────────────── │
│                                             │
│  ┌─ File picker ─────────────────────────┐  │
│  │  📦  skill-creator.zip       412 KB   │  │
│  │      [Replace file] [×]               │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Preview ─────────────────────────────┐  │
│  │  Name:        skill-creator           │  │
│  │  Description: Builder for new skills  │  │
│  │  Files:       23 · Total: 412 KB      │  │
│  │  Top-level:   SKILL.md, references/,  │  │
│  │               scripts/, examples/      │  │
│  └───────────────────────────────────────┘  │
│                                             │
│ ─────────────────────────────────────────── │
│                       [Cancel]  [Install →] │
└─────────────────────────────────────────────┘
```

### Layout — M-skill-1c install errors (four variants)

Each variant shares the file-picker chrome but the preview card is replaced by an error banner with the relevant code (`skill_frontmatter_missing`, `skill_name_taken`, `skill_size_exceeded` | `skill_file_too_large`, `skill_path_invalid`). Install button disabled with tooltip showing the error code.

### Layout — M-skill-4v2 delete cascade

```
┌─ Modal · 520px ────────────────────────────┐
│  ⚠ destructive · cannot undo                │
│  Delete skill-creator?                      │
│ ─────────────────────────────────────────── │
│                                             │
│  Cascade preview:                           │
│    • 23 files will be removed               │
│    • 2 connector links will be unlinked     │
│    • 1 cron link will be unlinked           │
│                                             │
│  Type "skill-creator" to confirm:           │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│ ─────────────────────────────────────────── │
│                       [Cancel] [Delete  🗑] │
└─────────────────────────────────────────────┘
```

For `profile` source, add yellow callout above cascade list: "This profile skill will be reseeded on next worker restart unless removed from `profiles/<n>/skills/`."

## Test plan / Success criteria summary

This spec ships when ALL the following pass:

- [ ] All 6 artboards exist in `zeno-agent` Paper file under the new section header.
- [ ] Each artboard reuses the established palette + typography + spacing — visual cohesion check via `get_screenshot` after each.
- [ ] Owner reviewed each artboard and confirmed visually. Owner approval is the only gate; no automated review for this spec.
- [ ] Approved artboard IDs (Paper node IDs from `get_basic_info`) recorded for spec 0062's plan.md to reference.

## Risks / Open Decisions

- **Editor textarea height**: full-screen file might need scroll. Decision deferred to draw time — the artboard shows a representative content height, implementation in 0062 handles overflow with a scrolled container.
- **File tree depth**: real skills can have 3+ levels of nesting. Artboard shows 2 levels (top + one folder deep) — sufficient for visual locking; 0062 implementation handles arbitrary depth.
- **Color for source pill**: `dashboard` is the writable variant — use neutral pill (panel-2 background, text-secondary). `profile` uses dim cyan. `zeno_default` uses gold. (Decisions made at draw time; revise if owner disagrees.)
- **Owner-call lock-in**: any meaningful disagreement during owner review re-triggers the artboard, but a layout invariant (file tree on left, editor on right) is locked unless owner explicitly says otherwise — saves cycles on bikeshedding column orientation.

## References

- Paper file: `zeno-agent` (Hearty island), Page 1.
- Existing skills artboards (spec 0052): `52G-0` (S1), `58N-0` (S2), `5BR-0` (S3 — superseded by S3v2), `5GF-0` (M-skill-1 — superseded by M-skill-1v2), `5IB-0` (M-skill-2 Edit body — superseded by S3v2's inline editor; kept as historical), `5LP-0` (M-skill-4 — superseded by M-skill-4v2), `5RQ-0` (M-skill-5 link), `5MX-0` (C-skill-1).
- Spec 0062 (implementation, depends on this): `context/specs/2026-04-30-skills-multi-file-impl/spec.md`.
- Memory: `feedback_paper_first_workflow.md` — Paper-first non-negotiable for UI features.
