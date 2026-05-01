---
feature: design-md-format
plan: "[[plan-design-md-format]]"
spec: "[[spec-design-md-format]]"
created: 2026-04-30
---
# DESIGN.md Format Adoption — Tasks

**For this plan:** `[[plan-design-md-format]]`

Working directory: `/Users/operator/www/octocat/zeno-agent-spec-0070` (worktree). Branch: `feat/spec-2026-04-30-design-md-format`. Commits use Conventional Commits with `(0070)` scope tag where natural.

## Phase 1: Tooling

### Task 1.1: Install `@google/design.md` and add scripts

**Files:**
- Modify: `package.json` (root)
- Auto: `pnpm-lock.yaml`

- [ ] **Step 1: Resolve the latest published version of `@google/design.md`**

  ```bash
  npm view @google/design.md version
  ```
  Expected: prints a semver string (record it for the next step).

- [ ] **Step 2: Add devDep at exact version (no `^` / no `~`)**

  Edit `package.json`. In `devDependencies`, add an entry:
  ```json
  "@google/design.md": "<EXACT_VERSION_FROM_STEP_1>"
  ```
  Keep the alphabetical order with the other devDeps.

- [ ] **Step 3: Add scripts**

  Edit `package.json`. Add three keys to the `scripts` block:
  ```json
  "design:lint": "design.md lint DESIGN.md",
  "design:diff": "design.md diff",
  "design:export-tailwind": "design.md export --format tailwind DESIGN.md"
  ```
  Keep them grouped together, after `build`.

- [ ] **Step 4: Install**

  ```bash
  cd /Users/operator/www/octocat/zeno-agent-spec-0070
  pnpm install
  ```
  Expected: lockfile updates; no errors.

- [ ] **Step 5: Verify the binary resolves**

  ```bash
  pnpm exec design.md --help
  ```
  Expected: usage text showing `lint`, `diff`, `export`, `spec` subcommands.

- [ ] **Step 6: Commit**

  ```bash
  git add package.json pnpm-lock.yaml
  git commit -m "feat(0070): add @google/design.md devDep + scripts"
  ```

## Phase 2: Vault

### Task 2.1: Vendor the format spec at pinned commit

**Files:**
- Create: `context/conventions/design-md-format.md`

- [ ] **Step 1: Fetch the pinned spec**

  ```bash
  cd /Users/operator/www/octocat/zeno-agent-spec-0070
  gh api repos/google-labs-code/design.md/contents/docs/spec.md --jq '.content' --header 'Accept: application/vnd.github.v3+json' \
    | base64 -d > /tmp/google-design-md-spec.md
  wc -l /tmp/google-design-md-spec.md
  ```
  Expected: file written, line count > 100.

- [ ] **Step 2: Author the vault file with vendoring header**

  Create `context/conventions/design-md-format.md`. The file is the spec body prefixed with a project-specific frontmatter and "vendored" header:

  ```markdown
  ---
  tags:
    - convention
    - design
  applies-to:
    - DESIGN.md
  source: https://github.com/google-labs-code/design.md
  source-commit: 8ecd4645b957e6a683a05fb9c79cd6c9028873d0
  vendored: 2026-04-30
  created: 2026-04-30
  ---
  # DESIGN.md format (vendored)

  This file is a snapshot of `docs/spec.md` from
  [google-labs-code/design.md](https://github.com/google-labs-code/design.md)
  at commit `8ecd4645b957e6a683a05fb9c79cd6c9028873d0`. It is the format the
  project's root `DESIGN.md` follows.

  > **Treat this as a snapshot, not a live mirror.** The npm package
  > `@google/design.md` ships its own copy of the spec; agents should use
  > whichever is closer at hand. To upgrade: re-fetch from the same path at a
  > newer commit, diff before bumping the dep, update `source-commit` and
  > `vendored` here, and bump `@google/design.md` in `package.json` in the
  > same commit.

  ---

  <CONTENT_OF_/tmp/google-design-md-spec.md_HERE>
  ```

  Replace `<CONTENT_OF_...>` with the actual file body. Keep the upstream content unchanged below the `---` separator.

- [ ] **Step 3: Verify the file is well-formed**

  ```bash
  head -25 context/conventions/design-md-format.md
  wc -l context/conventions/design-md-format.md
  ```
  Expected: frontmatter visible; total line count = upstream lines + ~25 (the header).

- [ ] **Step 4: Commit**

  ```bash
  git add context/conventions/design-md-format.md
  git commit -m "docs(0070): vendor DESIGN.md format spec at pinned commit"
  ```

### Task 2.2: Author the canonical-source rule

**Files:**
- Create: `context/rules/design-md-canonical.md`

- [ ] **Step 1: Write the rule file**

  Create `context/rules/design-md-canonical.md` with this exact content:

  ```markdown
  ---
  tags:
    - rule
    - workflow
    - design
  severity: important
  applies-to:
    - DESIGN.md
    - packages/ui/src/styles/tokens.css
    - apps/dashboard/src/styles/globals.css
  created: 2026-04-30
  ---
  # DESIGN.md is the canonical source for design tokens

  When changing any design token (colors, typography, spacing, radius,
  shadows, component archetype properties), update `/DESIGN.md` first;
  `packages/ui/src/styles/tokens.css` and any other code follows in the
  **same commit**. The two artifacts must match exactly. Drift is forbidden.

  ## Why

  Two artifacts (Paper visuals + code variables) already create cognitive
  load. Without a normative third anchor that combines machine-readable
  tokens and prose intent, agents and humans pick whichever is closer at
  hand and drift compounds. DESIGN.md is structured prose: tokens are
  parseable; rationale survives in plain text. It is also tool-friendly
  (`pnpm run design:lint`, `design:diff`, `design:export-tailwind`).

  Two specific failure modes this rule prevents:

  - **Silent token drift.** Changing `tokens.css` without updating
    DESIGN.md leaves the doc lying about reality.
  - **Reverse drift.** Changing DESIGN.md without `tokens.css` ships a
    feature where the doc promises a behavior the code doesn't deliver.

  ## How to Apply

  - **On any token change:** edit `DESIGN.md` first. Update the YAML
    frontmatter and the relevant `##` section prose. Then update
    `packages/ui/src/styles/tokens.css` (and any consumer in
    `apps/dashboard/src/styles/globals.css`) in the **same commit**.
  - **On a new component archetype:** add an entry to the `components:`
    block in DESIGN.md frontmatter (archetypes only — see Components
    section policy).
  - **Reviewers:** any PR that modifies `tokens.css` without a matching
    DESIGN.md diff should be requested-changes.
  - **`pnpm run design:lint`** is opt-in (not in `quality-gate`). Run it
    before opening a PR that touches design tokens. Triage warnings.

  ## Fallback if `@google/design.md` breaks

  The npm dep is `version: alpha`. If a future release breaks the format
  incompatibly:

  1. Drop `@google/design.md` from `package.json` devDeps.
  2. Drop the `design:*` scripts.
  3. Keep `DESIGN.md` itself unchanged — it remains a useful
     plain-markdown spec.
  4. Update `context/conventions/design-md-format.md` to note the
     vendored format is now authoritative.

  ## Out of scope

  - Auto-generating `tokens.css` from DESIGN.md (separate spec if drift
    becomes a real problem).
  - Light-mode tokens (Zeno is dark-only by design).
  - Per-frame Paper↔code registry (failed approach — see
    [[../learnings/per-frame-design-registry-failure]]).
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add context/rules/design-md-canonical.md
  git commit -m "docs(0070): add DESIGN.md canonical-source rule"
  ```

### Task 2.3: Author the learning note

**Files:**
- Create: `context/learnings/per-frame-design-registry-failure.md`

- [ ] **Step 1: Write the learning**

  Create `context/learnings/per-frame-design-registry-failure.md` with this exact content:

  ```markdown
  ---
  tags:
    - learning
    - gotcha
    - design
  related:
    - "[[../specs/2026-04-30-design-md-format/spec]]"
    - "[[../rules/design-md-canonical]]"
    - "[[../conventions/design-md-format]]"
  created: 2026-04-30
  ---
  # Per-frame Paper↔code registries don't survive Paper restructures

  The pre-2026-04-30 `packages/ui/DESIGN.md` carried a per-component
  table of Paper frame URLs (e.g. `Button → .../1-0/171-0`). After the
  Paper file was reorganized into route-based containers, most of those
  URLs still resolved (artboard IDs are preserved by `move_nodes`), but
  the registry was already partially obsolete by the time it was deleted
  — the brand it described ("Hearty island", coral `#e66b3d`,
  light/dark) was years stale; the live brand is "Imperial Terminal",
  gold `#d9b362`, dark-only. The doc lied about reality on multiple
  axes.

  ## Context

  Discovered while writing spec `[[../specs/2026-04-30-design-md-format/spec]]`.
  Reading `packages/ui/src/styles/tokens.css` showed gold accent and
  dark-only; reading `packages/ui/DESIGN.md` showed coral and dual-mode.
  The registry pattern compounded the staleness: every code change that
  added/removed a primitive needed a manual table edit in DESIGN.md, and
  every Paper restructure invalidated the URLs.

  ## How to Apply

  - **Don't rebuild the per-frame registry.** Use the Paper sidebar's
    route containers (introduced 2026-04-30 in the `zeno-agent` Paper
    file) for navigation. One pointer to the file root in `/DESIGN.md`'s
    "Source of truth" section is enough.
  - **Tokens are the durable contract.** Hex values, font families,
    radii, spacing scales — these survive Paper restructures because
    they're values, not pointers. Put them in DESIGN.md frontmatter
    (machine-readable) and code (`tokens.css`) and keep them aligned
    via [[../rules/design-md-canonical]].
  - **Component archetypes, not variants.** `button-primary` is durable;
    `button-primary-disabled-with-icon-loading` is not. The Components
    section in DESIGN.md should stop at archetypes.
  - **Brand changes are a code+doc commit.** When the brand shifts
    (Hearty island → Imperial Terminal), DESIGN.md is the first thing
    to update — not the last.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add context/learnings/per-frame-design-registry-failure.md
  git commit -m "docs(0070): learning on per-frame design registry failure"
  ```

### Task 2.4: Update vault indexes

**Files:**
- Modify: `context/_index/conventions.md`
- Modify: `context/_index/rules.md`
- Modify: `context/_index/learnings.md`

- [ ] **Step 1: Add convention link**

  Edit `context/_index/conventions.md`. Under `## Code style` (or in a new appropriate section near the top), insert a new bullet:
  ```markdown
  - [[../conventions/design-md-format|DESIGN.md format]] — vendored Google Labs spec at pinned commit; the format the root `DESIGN.md` follows.
  ```
  Place it as the last bullet under the existing list to avoid disturbing established ordering.

- [ ] **Step 2: Add rule link**

  Edit `context/_index/rules.md`. Under the `## \`severity: important\`` section, append after the last bullet:
  ```markdown
  - [[../rules/design-md-canonical|DESIGN.md is canonical for design tokens]] — on any token change, edit `/DESIGN.md` first; `packages/ui/src/styles/tokens.css` and consumers follow in the same commit.
  ```

- [ ] **Step 3: Add learning link**

  Edit `context/_index/learnings.md`. Under the `## \`#gotcha\` — Things that tripped us up` section, append after the last bullet:
  ```markdown
  - [[../learnings/per-frame-design-registry-failure|Per-frame Paper↔code registries don't survive restructures]] — the old `packages/ui/DESIGN.md` registry pattern; lesson informs spec 0070.
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add context/_index/conventions.md context/_index/rules.md context/_index/learnings.md
  git commit -m "docs(0070): index links for design-md format convention/rule/learning"
  ```

### Task 2.5: Update `ui-in-paper` rule

**Files:**
- Modify: `context/rules/ui-in-paper.md`

The current rule references `packages/ui/DESIGN.md` (being deleted) and the old Paper file ID `01KPA7BZ1AWQDRA79KQYGDA6V7`. Replace those references with the new model: route containers in the current `zeno-agent` Paper file, navigated via sidebar; no per-frame registry.

- [ ] **Step 1: Rewrite the rule**

  Overwrite `context/rules/ui-in-paper.md` with this exact content:

  ```markdown
  ---
  name: UI lives in Paper
  severity: important
  tags: [design, ui, governance]
  ---

  # UI lives in Paper

  Every component rendered in `apps/dashboard/**` MUST have a corresponding
  artboard in the Paper file `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`,
  page `1-0`), nested inside the appropriate route container in the
  sidebar. Paper is the visual source of truth; the dashboard is an
  implementation of it.

  > **No per-frame URL registry.** A previous version of this rule
  > required registering each component's frame URL in
  > `packages/ui/DESIGN.md`. That registry pattern failed (see
  > [[../learnings/per-frame-design-registry-failure]]) and has been
  > removed. Find frames by navigating the route container in the Paper
  > sidebar.

  ## When this rule applies

  Any change that produces, moves, renames, or deletes a rendered `.tsx`:

  - New component under `apps/dashboard/src/components/**`
  - New route under `apps/dashboard/src/routes/**`
  - Rename (kebab-case filename) or relocation of an existing component
  - Removal of a component

  Also applies to new primitives added to `packages/ui/src/components/**`.

  ## What the rule requires

  Before opening the PR:

  1. **Draw the artboard in Paper**, inside the route container that
     matches the component's surface (`design system`, `crons`,
     `sessions`, `connectors`, etc.). Match the conventions of that
     container — dark "Imperial Terminal" palette (canvas, panel, gold
     accent), tokens defined in `/DESIGN.md`, lowercase pills, the
     gold-italic Z brand mark.
  2. **If you rename or move code**, rename or move the artboard in
     Paper to match.
  3. **If you delete code**, delete or archive the artboard in the
     same session (don't leave orphans).

  Enforcement is by PR review, not CI. A reviewer who sees rendered
  `.tsx` changes with no corresponding Paper change should request
  changes.

  ## Why it matters

  Without this link, the dashboard and the design drift silently. Zeno
  is a single-operator tool — the visual cost of drift is paid every
  day by the one person using it. Paper is where design decisions get
  made deliberately; code is where they get implemented. Skipping Paper
  means skipping the design decision.

  The rule is cheap to follow (drawing an artboard inside the right
  container is a few minutes) and expensive to skip (page-level
  repaints later cost hours).

  ## Scope

  - **In scope:** rendered React components and routes in the dashboard.
  - **Out of scope:** internal hooks, data-fetch modules, utility
    functions, server code, shared types. These don't have a visual
    surface.
  - **Out of scope:** ephemeral screenshots or one-off mocks. If it's
    going to ship, it needs an artboard.

  ## Related

  - [[../conventions/design-md-format]] — the DESIGN.md format that
    captures the brand tokens visible in Paper.
  - [[design-md-canonical]] — DESIGN.md is the canonical source for
    tokens; this rule covers the visual / artboard side.
  - [[../learnings/per-frame-design-registry-failure]] — context for
    why the per-frame URL registry was removed.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add context/rules/ui-in-paper.md
  git commit -m "docs(0070): rewrite ui-in-paper rule (no per-frame registry; route containers)"
  ```

## Phase 3: Author DESIGN.md

### Task 3.1: Author root `DESIGN.md`

**Files:**
- Create: `DESIGN.md` (repo root)

Tokens are extracted verbatim from these sources of truth (read once before authoring):

- `packages/ui/src/styles/tokens.css` — colors (canvas, panel, panel-2, sidebar; border-subtle, border-strong, hairline; text-primary/secondary/tertiary/ink; gold + variants; status active/paused/failed/info; overlay; shadows).
- `apps/dashboard/src/styles/globals.css` — font families (`--font-sans` Space Grotesk, `--font-serif` Fraunces, `--font-mono` JetBrains Mono).
- `apps/dashboard/src/styles/globals.css` — body font-size 14px; line-height 1.5.

- [ ] **Step 1: Re-read the source files for verbatim values**

  ```bash
  cat packages/ui/src/styles/tokens.css
  head -40 apps/dashboard/src/styles/globals.css
  ```

- [ ] **Step 2: Write `DESIGN.md` at repo root**

  Create `DESIGN.md` with this structure (the YAML frontmatter values must come from Step 1 verbatim — do not invent):

  ```markdown
  ---
  version: alpha
  name: Imperial Terminal
  description: Zeno's dashboard design system. Ink-blue surfaces, imperial-gold accent, mono-first typography. Dark only.
  colors:
    canvas: "#08090F"
    panel: "#0f1119"
    panel-2: "#151824"
    sidebar: "#05060F"
    border-subtle: "#1e2131"
    border-strong: "#2a2e44"
    text-primary: "#e8eaf5"
    text-secondary: "#8a8fab"
    text-tertiary: "#4b4f66"
    text-ink: "#0a0b12"
    gold: "#d9b362"
    gold-bright: "#f0cc7a"
    gold-deep: "#8a6d2e"
    status-active: "#6bd3a3"
    status-paused: "#d9b362"
    status-failed: "#e8617a"
    status-info: "#7aa6e8"
  typography:
    body:
      fontFamily: Space Grotesk
      fontSize: 14px
      fontWeight: 400
      lineHeight: 1.5
    mono:
      fontFamily: JetBrains Mono
      fontSize: 13px
      fontWeight: 400
      lineHeight: 1.4
    serif-display:
      fontFamily: Fraunces
      fontSize: 28px
      fontWeight: 500
      lineHeight: 1.2
      letterSpacing: -0.01em
    label-caps:
      fontFamily: JetBrains Mono
      fontSize: 11px
      fontWeight: 500
      lineHeight: 1
      letterSpacing: 0.08em
  rounded:
    none: 0px
    sm: 2px
    md: 4px
    lg: 8px
    full: 9999px
  spacing:
    xs: 4px
    sm: 8px
    md: 12px
    lg: 16px
    xl: 24px
    2xl: 32px
  components:
    button-primary:
      backgroundColor: "{colors.gold}"
      textColor: "{colors.text-ink}"
      typography: "{typography.label-caps}"
      rounded: "{rounded.md}"
      padding: 12px
    button-primary-hover:
      backgroundColor: "{colors.gold-bright}"
    button-ghost:
      backgroundColor: "{colors.panel}"
      textColor: "{colors.text-primary}"
      rounded: "{rounded.md}"
      padding: 12px
    pill:
      backgroundColor: "{colors.panel-2}"
      textColor: "{colors.text-secondary}"
      typography: "{typography.label-caps}"
      rounded: "{rounded.full}"
      padding: 4px
    dialog-surface:
      backgroundColor: "{colors.panel}"
      rounded: "{rounded.lg}"
    input:
      backgroundColor: "{colors.canvas}"
      textColor: "{colors.text-primary}"
      rounded: "{rounded.md}"
      padding: 8px
  ---

  # Imperial Terminal

  Zeno's dashboard design system. Ink-blue surfaces, imperial-gold accent,
  mono-first typography. Dark only.

  ## Overview

  The dashboard is a personal control room for an agent that operates
  across the apps you use. The mood is **vehicle dashboard** — instrument
  black surfaces with a single amber-LED accent, mono-first labels for
  precision, and serif moments reserved for the rare display heading.
  Everything else is restrained: small type, narrow rhythm, no decoration
  that doesn't carry information.

  Light mode does not exist. Dark is the canonical mode and the only mode.
  This is a deliberate constraint, not an oversight: the dashboard is used
  for ambient monitoring and quick action, and the gold accent reads
  cleanly only against deep ink-blue surfaces.

  ## Colors

  The palette is rooted in deep ink-blue neutrals (`canvas`, `panel`,
  `panel-2`, `sidebar`) with one driving accent — **imperial gold**
  (`gold`, `gold-bright`, `gold-deep`).

  - **Surfaces.** `canvas` (`#08090F`) is the page ground. `panel`
    (`#0f1119`) is the default raised surface (cards, popovers,
    dialogs). `panel-2` (`#151824`) is for nested or pressed states.
    `sidebar` (`#05060F`) is the deepest surface, reserved for the left
    chrome.
  - **Borders.** `border-subtle` for default rules; `border-strong`
    when separation needs to be felt without color.
  - **Text.** `text-primary` is the default body color. `text-secondary`
    is for metadata, captions, and helpers. `text-tertiary` is for muted
    state (disabled, decorative). `text-ink` is the inverse, used only
    on gold surfaces.
  - **Imperial gold.** `gold` is THE accent — the single brand color and
    the driver of every primary action. `gold-bright` is the hover lift.
    `gold-deep` is the pressed / dim state. Reserved exclusively for
    primary affirmative actions and the brand mark.
  - **Status.** `status-active` (jade), `status-paused` (gold reused),
    `status-failed` (carmine), `status-info` (cobalt). Used for pills,
    indicators, and inline state — never as a background fill.

  ## Typography

  Three families, each with a precise role.

  - **Space Grotesk** — body. Open neutral grotesque; the everyday voice
    of the UI. Used for paragraphs, button labels, and any reading
    surface.
  - **JetBrains Mono** — labels, kickers, status pills, code, IDs,
    timestamps, anything that should read as a data point rather than
    prose. Mono is the dominant register on this dashboard.
  - **Fraunces** — serif display. Used sparingly for hero page titles
    (the `Z` brand mark and a small number of marquee numerals). Italic
    cuts only.

  Body is `14px / 1.5`. Mono is `13px / 1.4`. Labels (caps) are `11px`
  with generous tracking (`0.08em`). Display serif is `28px / 1.2` with
  slightly tighter tracking.

  ## Layout

  Single-density layout. The dashboard is meant to be skimmed at a
  glance, not browsed.

  - **Sidebar.** Fixed-width left chrome on `sidebar` surface, contains
    brand, primary nav, and runtime status. Sticky, full-height.
  - **Main column.** No max-width clamp — the dashboard is operator-only
    and rarely viewed below 1280px. Content uses a 24-32px outer gutter.
  - **Spacing scale.** `xs 4 / sm 8 / md 12 / lg 16 / xl 24 / 2xl 32`.
    Pick the smaller value when in doubt; cramped beats roomy here.

  ## Elevation & Depth

  Tonal, not shadowed. Hierarchy is conveyed by surface tone:
  `canvas → panel → panel-2`. Floating elements (dialogs, popovers)
  add a soft shadow plus a 1px gold-line border at low opacity.

  Three named shadows in code (`tokens.css`):

  - `--shadow-panel` — barely-there inner highlight + 1px black drop;
    used on cards.
  - `--shadow-float` — pronounced soft drop for dialogs.
  - `--shadow-gold-glow` — gold ring + halo, used on focus and hover
    affordances.

  ## Shapes

  Sharp by default. Radii are tiny (`sm 2 / md 4 / lg 8`); `none` and
  `full` are the only common deviations. Cards use `md` (4px); dialogs
  and panels use `lg` (8px); pills and circular indicators use `full`.

  Sharpness reinforces the instrument-panel mood. Avoid mixing `lg` and
  `none` in the same view.

  ## Components

  Component archetypes (intent only — full variant inventory belongs in
  Paper).

  - **`button-primary`.** The single affirmative per surface. Gold
    background, ink text, mono caps label. Reserved for the action that
    progresses the surface (Run now, Save, Create, Install).
  - **`button-primary-hover`.** Gold-bright lift on hover.
  - **`button-ghost`.** Default-density action; panel background, primary
    text. For navigation and secondary actions.
  - **`pill`.** Lowercase short-form status (`active`, `paused`,
    `failed`, `info`). Mono caps. No background tint by default — the
    color is communicated by the leading dot indicator.
  - **`dialog-surface`.** Floating panel for confirmations and forms.
    `panel` background, `lg` rounded, `--shadow-float`.
  - **`input`.** Canvas-deep field on raised surfaces (looks recessed),
    `md` rounded, mono text for code/IDs and body text for prose.

  ## Do's and Don'ts

  - **Do** reserve `gold` for the single primary affirmative per
    surface. Never two.
  - **Don't** use `gold` for borders, backgrounds, or secondary chrome.
    The accent loses force the moment it spreads.
  - **Do** keep status pill labels lowercase (`active`, not `ACTIVE`).
    Kickers and filter chips stay UPPERCASE.
  - **Don't** mix sharp (`none`) and rounded (`lg`) corners in the same
    view. Pick one mood and hold it.
  - **Do** lead labels in JetBrains Mono caps with positive tracking.
    Mono is the default register for non-prose.
  - **Don't** introduce light-mode tokens. Dark is the only mode.
    Light-mode hex values do not exist in this design system.
  - **Do** maintain WCAG AA contrast on text (≥ 4.5:1). Gold-on-canvas
    and primary-text-on-canvas both clear it; verify before adding new
    pairings.
  - **Don't** add a font family. The three families above carry every
    role; adding a fourth dilutes the system.
  - **Don't** create per-component variant tokens (e.g.
    `button-primary-disabled-hover`). Stop at archetypes; Paper carries
    the variants.

  ## Source of truth

  - **Visual:** Paper file `zeno-agent`
    ([`01KPYCJ6QXK8Z1PEVQME9262RP`](https://app.paper.design/file/01KPYCJ6QXK8Z1PEVQME9262RP/1-0)).
    Page `1-0`. Routes are organized into top-level container artboards
    in the sidebar (design system, login, home, crons, sessions, logs,
    settings, connectors, channels, skills). Navigate the container to
    find a component's artboard.
  - **Tokens (code):** `packages/ui/src/styles/tokens.css` — must match
    the YAML frontmatter above exactly. See
    [`context/rules/design-md-canonical.md`](context/rules/design-md-canonical.md).
  - **Format spec:** see
    [`context/conventions/design-md-format.md`](context/conventions/design-md-format.md)
    (vendored from `google-labs-code/design.md`).
  ```

- [ ] **Step 3: Lint**

  ```bash
  pnpm run design:lint
  ```
  Expected: `errors: 0`. Warnings allowed (e.g. orphan tokens, contrast info) — review and triage. Document the resulting summary in the next step.

- [ ] **Step 4: Triage warnings**

  Read the JSON output. For each warning:
  - **`broken-ref`** → fix the YAML reference path.
  - **`contrast-ratio`** below 4.5 → re-pair colors or add a Do/Don't note acknowledging the dim use case.
  - **`orphaned-tokens`** → either reference the token from a component or remove it.
  - **`section-order`** → fix the heading order.

  Re-run `pnpm run design:lint` until errors are 0 and remaining warnings are acknowledged in the file (or judged acceptable for an alpha doc — note the call in the commit message).

- [ ] **Step 5: Commit**

  ```bash
  git add DESIGN.md
  git commit -m "feat(0070): add canonical /DESIGN.md (Imperial Terminal)"
  ```

## Phase 4: Cross-references and old DESIGN.md removal

### Task 4.1: Update `tokens.css` header comment

**Files:**
- Modify: `packages/ui/src/styles/tokens.css`

- [ ] **Step 1: Replace the header comment**

  Open `packages/ui/src/styles/tokens.css`. The first 9 lines are a comment block. Replace lines 1-9 with:

  ```css
  /*
   * Zeno design tokens — "Imperial Terminal"
   *
   * THIS FILE IS DERIVED. The canonical source for token values lives in
   * /DESIGN.md (YAML frontmatter). On any token change, edit /DESIGN.md
   * first; this file follows in the same commit.
   * See context/rules/design-md-canonical.md.
   *
   * Ink-blue surfaces, imperial gold accent, mono-first typography.
   * Dark is the ONLY mode. No light palette.
   *
   * Tailwind v4 @theme block maps CSS variables into utilities
   * (bg-canvas, text-gold, border-border-subtle, etc.).
   */
  ```

- [ ] **Step 2: Verify Tailwind still parses**

  ```bash
  pnpm run typecheck
  ```
  Expected: green. (Comment-only change; build smoke is just a sanity check that nothing else regressed.)

- [ ] **Step 3: Commit**

  ```bash
  git add packages/ui/src/styles/tokens.css
  git commit -m "docs(0070): tokens.css header points at canonical /DESIGN.md"
  ```

### Task 4.2: Update `CLAUDE.md` (root)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the pointer**

  Open `CLAUDE.md`. Find the `## Knowledge locations` table. After the row for "Code style conventions" (or the last row if "Code style" isn't there), add a new row:

  ```markdown
  | Design system (tokens + intent) | `DESIGN.md` (root) — Imperial Terminal. Format spec: `context/conventions/design-md-format.md`. Canonical-source rule: `context/rules/design-md-canonical.md`. |
  ```

- [ ] **Step 2: Verify**

  ```bash
  grep -n "DESIGN.md" CLAUDE.md
  ```
  Expected: at least 1 hit on the new row.

- [ ] **Step 3: Commit**

  ```bash
  git add CLAUDE.md
  git commit -m "docs(0070): point CLAUDE.md at canonical /DESIGN.md"
  ```

### Task 4.3: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the pointer**

  Open `AGENTS.md`. Find the `## Knowledge locations` table. Insert the same row used in CLAUDE.md after the existing rows:

  ```markdown
  | Design system (tokens + intent) | `DESIGN.md` (root) — Imperial Terminal. Format spec: `context/conventions/design-md-format.md`. Canonical-source rule: `context/rules/design-md-canonical.md`. |
  ```

- [ ] **Step 2: Verify**

  ```bash
  grep -n "DESIGN.md" AGENTS.md
  ```
  Expected: at least 1 hit on the new row.

- [ ] **Step 3: Commit**

  ```bash
  git add AGENTS.md
  git commit -m "docs(0070): point AGENTS.md at canonical /DESIGN.md"
  ```

### Task 4.4: Delete the stale `packages/ui/DESIGN.md`

**Files:**
- Delete: `packages/ui/DESIGN.md`

- [ ] **Step 1: Confirm no incoming references remain**

  ```bash
  grep -rn "packages/ui/DESIGN.md" \
    --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" \
    /Users/operator/www/octocat/zeno-agent-spec-0070
  ```
  Expected: zero matches. (The `ui-in-paper` rule has already been rewritten in Task 2.5.) If anything matches, fix the reference first; do not delete the file with stale links pointing at it.

- [ ] **Step 2: Delete**

  ```bash
  git rm packages/ui/DESIGN.md
  ```

- [ ] **Step 3: Commit**

  ```bash
  git commit -m "chore(0070): remove stale packages/ui/DESIGN.md (superseded by /DESIGN.md)"
  ```

## Phase 5: Verification

### Task 5.1: End-to-end checks

- [ ] **Step 1: `design:lint` clean**

  ```bash
  pnpm run design:lint
  ```
  Expected: `errors: 0`. Warnings, if any, are acknowledged (in DESIGN.md prose or in the spec).

- [ ] **Step 2: `quality-gate` green**

  ```bash
  pnpm run quality-gate
  ```
  Expected: green across lint + typecheck + test.

- [ ] **Step 3: Sanity checks**

  ```bash
  test -f DESIGN.md && echo "DESIGN.md OK"
  test ! -f packages/ui/DESIGN.md && echo "old DESIGN.md removed OK"
  test -f context/conventions/design-md-format.md && echo "vendored spec OK"
  test -f context/rules/design-md-canonical.md && echo "canonical rule OK"
  test -f context/learnings/per-frame-design-registry-failure.md && echo "learning OK"
  grep -q "Imperial Terminal" DESIGN.md && echo "brand correct"
  grep -q "#d9b362" DESIGN.md && echo "gold token present"
  grep -q "DESIGN.md" CLAUDE.md && echo "CLAUDE.md pointer OK"
  grep -q "DESIGN.md" AGENTS.md && echo "AGENTS.md pointer OK"
  grep -q "DESIGN.md" packages/ui/src/styles/tokens.css && echo "tokens.css header OK"
  ```
  Expected: all 10 lines print their OK message.

- [ ] **Step 4: Diff check vs tokens.css values**

  ```bash
  for hex in "#08090F" "#0f1119" "#151824" "#05060F" "#1e2131" "#2a2e44" "#e8eaf5" "#8a8fab" "#4b4f66" "#0a0b12" "#d9b362" "#f0cc7a" "#8a6d2e" "#6bd3a3" "#e8617a" "#7aa6e8"; do
    grep -q "$hex" DESIGN.md && grep -qi "$hex" packages/ui/src/styles/tokens.css && echo "$hex matched both" || echo "$hex MISMATCH"
  done
  ```
  Expected: every line ends with "matched both". Any "MISMATCH" must be fixed before proceeding.

## Phase 6: Three-round final review

Per Rule 2 of `tmp/zeno-cleanup-contract.md`. Each round walks the deliverables listed in `spec.md` Success Criteria; any finding restarts the counter.

- [ ] **Round 1.** Walk Success Criteria checklist. Walk each new/modified file. Ensure no TODOs, no stale "Hearty island" / coral references anywhere in the changed surface (`grep -rni "hearty\|coral\|#e66b3d" --exclude-dir=node_modules --exclude-dir=tmp --exclude-dir=.git`).

- [ ] **Round 2.** Re-read `DESIGN.md` end-to-end as a stranger. Tokens match `tokens.css`? Prose matches the dashboard you'd see in the browser? `pnpm run design:lint` still clean?

- [ ] **Round 3.** Walk the three index files (`conventions`, `rules`, `learnings`). Wikilinks resolve? `pnpm run quality-gate` re-run for paranoia.

If any round surfaces a finding, fix it and **reset the counter** before continuing.

## Phase 7: PR

### Task 7.1: Push branch and open PR

- [ ] **Step 1: Push branch**

  ```bash
  cd /Users/operator/www/octocat/zeno-agent-spec-0070
  git push -u origin feat/spec-2026-04-30-design-md-format
  ```

- [ ] **Step 2: Open the PR**

  Use `gh pr create` (project preference is `/open-pr` slash command, but the equivalent gh invocation works here):

  ```bash
  gh pr create \
    --title "feat: adopt google-labs DESIGN.md format (spec 0070)" \
    --body "$(cat <<'EOF'
  ## Summary
  - New canonical `/DESIGN.md` at repo root following [google-labs-code/design.md](https://github.com/google-labs-code/design.md) format. Tokens extracted verbatim from `packages/ui/src/styles/tokens.css` + `apps/dashboard/src/styles/globals.css` — Imperial Terminal brand, gold accent `#d9b362`, dark only.
  - `packages/ui/DESIGN.md` deleted (described stale "Hearty island" brand and a fragile per-frame Paper registry).
  - `@google/design.md` added as devDep at pinned exact version + opt-in scripts (`design:lint`, `design:diff`, `design:export-tailwind`). **Not** wired into `quality-gate` — alpha tooling.
  - Format spec vendored at pinned commit (`context/conventions/design-md-format.md`).
  - Canonical-source rule (`context/rules/design-md-canonical.md`) + learning on the failed registry pattern.
  - `ui-in-paper` rule rewritten to drop the deleted DESIGN.md registry; route-container navigation model.

  Spec: `context/specs/2026-04-30-design-md-format/`.

  ## Test plan
  - [ ] `pnpm run design:lint` exits 0
  - [ ] `pnpm run quality-gate` green
  - [ ] `DESIGN.md` token values byte-match `tokens.css`
  - [ ] `packages/ui/DESIGN.md` removed; no incoming references remain
  - [ ] `CLAUDE.md` / `AGENTS.md` / `tokens.css` header all point at `/DESIGN.md`
  - [ ] Vault indexes link the new convention/rule/learning
  EOF
  )"
  ```

- [ ] **Step 3: Capture the PR URL**

  Print the URL output by `gh pr create`. Notify owner.
