---
status: draft
spec: "2026-04-30-skills-multi-file-paper"
created: 2026-04-30
---
# Spec 0061 — Skills multi-file Paper artboards — Tasks

This is Phase 0 of the spec 0062 implementation. Six artboards in `zeno-agent` Paper file ("Hearty island"), under a new `— SKILLS UI v2 (spec 0061)` section header.

## Phase 0 — Paper artboards

### Task 0.1 — Section header

- [ ] `create_artboard` named `— SKILLS UI v2 (spec 0061)`, dimensions 6000×48, positioned at `top: 18400px, left: 0px`. Same shape as the existing `— SKILLS UI (spec 0052)` and `— CHANNELS UI (spec 0059)` headers.
- [ ] Inside the artboard: gold-on-canvas title text matching the existing pattern (e.g., "— SKILLS UI v2 (spec 0061)" left-aligned, mono font, size matching neighbors).
- [ ] `get_screenshot` to verify position relative to neighbors.

### Task 0.2 — S3v2 · Skill detail (file tree + editor, dashboard source)

- [ ] `create_artboard` named `S3v2 · /skills/<id> (file tree + editor, dashboard)`, 1440×900 (will switch to `fit-content` after content settles), positioned at `top: 18540px, left: 0px`.
- [ ] Build sidebar by cloning `1P9-0` (C2) or `61Q-0` (CH1). Active item: `skills`.
- [ ] Build topstrip with breadcrumb `zeno / skills / skill-creator`.
- [ ] Build header row:
  - 56×56 icon container (panel-2 bg, gold-line border)
  - h1 `skill-creator`
  - description prose `Builder for new Anthropic skills`
  - meta line: `installed 2d ago · 23 files · 412 KB`
  - `dashboard` source pill (panel-2 bg, text-secondary)
  - `[✎ Edit description]` button right
  - `[⋯]` kebab menu icon button right
- [ ] Build two-column grid:
  - **Left (280px wide, file tree)**: header label "FILES", collapsible folder tree showing `/`, `SKILL.md` (selected, gold-line bg), `references/` (open) → `apis.md`, `rules.md`, `scripts/` (open) → `helper.sh`, `examples/` (open) → `demo.json`. Use chevron + dot icon convention.
  - **Right (fills, editor)**: header label "EDITOR" + small filename badge `SKILL.md`, textarea with monospace text showing example markdown:
    ```
    # Skill Creator

    Use this skill when the operator asks you to create a new skill from scratch.

    ## Inputs

    - description: 1-2 sentences
    - capability targets: which tools (Bash/Read/Edit) the skill needs

    ...
    ```
  - Save button bottom-right of editor (gold primary).
- [ ] Switch artboard to `height: fit-content` via `update_styles`.
- [ ] `get_screenshot`. Sanity check spacing/alignment against existing detail pages (e.g., `1XN-0` C3).
- [ ] `finish_working_on_nodes`.

### Task 0.3 — S3v2-readonly · Skill detail (zeno_default + profile, read-only)

- [ ] `create_artboard` named `S3v2-readonly · /skills/<id> (read-only · zeno_default + profile)`, 1440×900 fit-content, positioned at `top: 18540px, left: 1520px`.
- [ ] Sidebar + topstrip clones (same as 0.2).
- [ ] **Two header rows stacked vertically** inside the page area, separated by an annotation tag:
  - First header row: skill `zeno-development`, source pill `zeno_default` (gold). Edit description button HIDDEN. Annotation tag above: `── zeno_default source ──`.
  - Second header row: skill `fn-code-review`, source pill `profile` (dim cyan). Edit description button HIDDEN. Annotation tag above: `── profile source ──`.
- [ ] One body grid below both headers (file tree + editor). Editor's Save button is **disabled** (gray) with a tooltip overlay: "read-only — edit on the host".
- [ ] `get_screenshot`, `finish_working_on_nodes`.

### Task 0.4 — M-skill-1v2 · Install zip (success preview)

- [ ] `create_artboard` named `M-skill-1v2 · Install zip (success preview)`, 800×fit-content, positioned at `top: 18540px, left: 3040px`.
- [ ] Modal shell: clone the chrome from `5GF-0` (existing M-skill-1) — corner brackets, panel bg, header row.
- [ ] Header: small kicker "install · skill", h2 "Add skill from zip".
- [ ] File picker block: shows the chosen file with icon, name `skill-creator.zip`, size `412 KB`, action buttons `[Replace file]` `[×]`.
- [ ] Preview card:
  - `Name: skill-creator`
  - `Description: Builder for new Anthropic skills`
  - `Files: 23 · Total: 412 KB`
  - `Top-level: SKILL.md, references/, scripts/, examples/`
- [ ] Footer: outline `[Cancel]` left, primary gold `[Install →]` right.
- [ ] `get_screenshot`, `finish_working_on_nodes`.

### Task 0.5 — M-skill-1c · Install errors (4 variants)

- [ ] `create_artboard` named `M-skill-1c · Install errors (4 variants)`, 800×fit-content, positioned at `top: 18540px, left: 3920px`.
- [ ] **Single artboard, four variants stacked vertically** (matches existing `21 · Inline action states` pattern). Each variant is a copy of the M-skill-1v2 modal shell with only the preview card region replaced:
  - Variant A — `skill_frontmatter_missing`: red-on-canvas error banner "No SKILL.md found at root of zip", Install disabled.
  - Variant B — `skill_name_taken`: red banner "A skill named `skill-creator` is already installed (source: dashboard)". Install disabled.
  - Variant C — `skill_size_exceeded` / `skill_file_too_large`: red banner "Total size exceeds 5 MB cap (uploaded: 6.2 MB)" or "File `examples/big.json` exceeds 1 MB cap". Install disabled.
  - Variant D — `skill_path_invalid`: red banner "Zip contains entries with `..` or absolute paths — refusing to extract for safety". Install disabled.
- [ ] Annotation labels above each variant.
- [ ] `get_screenshot`, `finish_working_on_nodes`.

### Task 0.6 — M-skill-4v2 · Delete cascade (dashboard)

- [ ] `create_artboard` named `M-skill-4v2 · Delete cascade (dashboard)`, 520×fit-content (matches CH-3 destructive convention), positioned at `top: 18540px, left: 4800px`.
- [ ] Modal shell: smaller width, kicker "⚠ destructive · cannot undo" (red), h2 "Delete skill-creator?".
- [ ] Cascade preview card (panel-2 bg):
  - Bullet "23 files will be removed"
  - Bullet "2 connector links will be unlinked"
  - Bullet "1 cron link will be unlinked"
- [ ] Type-to-confirm input below: label "Type `skill-creator` to confirm:", textarea shorter (single-line).
- [ ] Footer: outline `[Cancel]`, destructive `[Delete 🗑]` (red bg or red border).
- [ ] `get_screenshot`, `finish_working_on_nodes`.

### Task 0.7 — M-skill-4v2-profile · Delete cascade (profile reseed warning)

- [ ] `create_artboard` named `M-skill-4v2-profile · Delete cascade (profile reseed)`, 520×fit-content, positioned at `top: 18540px, left: 5360px` (next to 0.6).
- [ ] Same modal shell as 0.6 but for skill `fn-code-review` (profile source).
- [ ] **Above the cascade preview card**, insert a yellow callout banner: "This profile skill will be reseeded on next worker restart unless removed from `profiles/<n>/skills/`. To delete permanently, remove the host directory."
- [ ] Cascade preview card otherwise same.
- [ ] `get_screenshot`, `finish_working_on_nodes`.

### Task 0.8 — Visual cohesion sweep

- [ ] `get_screenshot` of each artboard at 1× scale.
- [ ] Verify against checkpoints from `paper-mcp-instructions` guide:
  - Spacing rhythm (gaps in 4/8/16 multiples)
  - Type hierarchy clear (h1 vs body vs labels)
  - Source pill colors distinguishable (`dashboard` neutral, `zeno_default` gold, `profile` dim cyan)
  - File tree icons aligned (chevrons + dots in fixed-width slot)
  - Save button states distinguishable (enabled gold vs disabled gray)
- [ ] Take any "tighten the screws" pass — fix obvious alignment / contrast / typography issues.
- [ ] All artboards in `fit-content` height (no large empty bottoms).

### Task 0.9 — Capture artboard IDs for spec 0062 plan.md

- [ ] `get_basic_info` to list all artboards with their IDs.
- [ ] Record the 6 new artboard IDs (S3v2, S3v2-readonly, M-skill-1v2, M-skill-1c, M-skill-4v2, M-skill-4v2-profile) in a comment block at the bottom of this tasks.md as `## Artboard IDs (post-draw)`.
- [ ] Commit final state.

### Task 0.10 — Owner review gate

- [ ] Stop here. Send a summary message to the operator with screenshots OR direct artboard IDs to review in Paper.
- [ ] Wait for operator approval (or revision requests).
- [ ] Only after approval: spec 0062 implementation can begin (writing-plans for 0062 → plan.md → impl).

---

## Artboard IDs (post-draw)

Captured 2026-04-30 after Phase 0 completion. Reference these in spec 0062 plan.md when wiring up the implementation tasks.

**Layout:** section header → pages row → modals row, matching the convention used by Skills v1 (spec 0052) and Channels (spec 0059). Section moved below the Channels modals (M-ch-1 ends at y=18906) to leave clean vertical separation.

| Artboard | ID | Row | Position | Size |
|---|---|---|---|---|
| Section header `— SKILLS UI v2 (spec 0061)` | `6JG-0` | header | top:19040 left:0 | 6000×48 |
| **S3v2** · `/skills/skill-creator` (file tree + editor, dashboard) | `6JK-0` | pages | top:19180 left:0 | 1440×900 |
| **S3v2-readonly** · `/skills/<id>` (read-only · zeno_default + profile) | `6OQ-0` | pages | top:19180 left:1520 | 1440×fit (1058) |
| **M-skill-1v2** · Install zip (success preview) | `6UD-0` | modals | top:20320 left:0 | 800×fit (621) |
| **M-skill-1c** · Install errors (4 variants A/B/C/D) | `6WK-0` | modals | top:20320 left:880 | 800×fit (1604) |
| **M-skill-4v2** · Delete cascade (dashboard) | `71K-0` | modals | top:20320 left:1760 | 520×fit (528) |
| **M-skill-4v2-profile** · Delete cascade (profile reseed warning) | `72Y-0` | modals | top:20320 left:2360 | 520×fit (576) |

**File tree convention** in S3v2 / S3v2-readonly: chevron + file/folder icon in 10×10 fixed-width slots, indent steps of 14px, selected row uses `#D9B3621A` bg + `#D9B362` 2px left border.

**Source pill palette** locked across all artboards:
- `dashboard` → `#1B1F2E` bg + `#8A8FAB` text (neutral)
- `zeno_default` → `#D9B3621A` bg + `#D9B362` text (gold)
- `profile` → `#7AA6E81A` bg + `#7AA6E8` text (cyan)

**Save button states** locked:
- enabled → `#D9B362` bg + `#08090F` text (gold primary)
- disabled (read-only) → `#1B1F2E` bg + `#8A8FAB` text + `opacity: 0.4`
