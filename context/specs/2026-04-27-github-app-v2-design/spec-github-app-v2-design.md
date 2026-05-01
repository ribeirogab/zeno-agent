---
status: approved
feature: github-app-v2-design
created: 2026-04-27
shipped: null
---
# GitHub App v2 — Visual Design Spec

**Status:** Draft
**Scope:** Define the dashboard UI/UX for the GitHub App connector — listing representation, App detail page (entity model), per-installation detail page, install/lifecycle modals — as 10 new artboards in the existing Paper file (`zeno-agent`). Visual deliverable only; no code. Output of this spec is referenced by specs 0044 (backend), 0045 (install + listing UI), 0046 (lifecycle UI) as their visual source of truth.

## Brainstorm Q&A

This spec is the first of 6 follow-up specs (0043-0048) addressing the production gaps surfaced after spec 0042 shipped. The user manually invoked `/brainstorming` and answered each question explicitly.

### Q1 — How to represent github_app in the listing `/connectors`?

The 4 installations today (`github-app-fnlivros`, `github-app-quickshoperp`, `github-app-flavia-nasser-oms`, `github-app-chatdesk-brasil`) appear as 4 separate rows in the listing. Visually they don't communicate that they share one App credential, and there's no anchor for App-level actions (rotate PEM, test all, see app_id).

**Decision: Option C — single row "GitHub App", rich detail page.** The listing collapses to one row "GitHub App · 4 installations". Clicking opens a detail page with two parts: (1) app-level config (`app_id`, PEM rotation, test all), (2) installations table with status + per-row actions. This mirrors the GitHub model (App → Installations) and keeps the listing scannable as more connectors install.

**Trade-off accepted:** detail page becomes denser than C3 (Linear) — but it's where everything happens.

### Q2 — How to separate install vs add installation?

**Decision: Option B — separated.** First install asks only `app_id` + PEM. After install, detail page shows empty state "0 installations · add your first" with CTA. Add-installation flow is the same regardless of count. App and Installation are independent entities.

**Reasons:** one code path for add/remove regardless of count; empty state functions as natural onboarding for the first add; simpler endpoints; auto-discover (`GET /app/installations`) makes sense in both flows.

**Trade-off accepted:** 2 explicit clicks instead of 1. Empty state CTA mitigates friction.

### Q3 — Auto-discover installations via GitHub API?

**Decision: Option C — auto-discover with manual fallback.** Default flow calls `GET /app/installations` (with App JWT), lists orgs where the App is installed. User picks. Manual entry button as escape hatch (for cases where GitHub API fails or operator has installation_id ready).

**Reasons:** auto-discover is best UX (real org names, no copy-paste IDs, env_var auto-suggested from name). Manual fallback covers edge cases. Backend reuses existing JWT signing infrastructure.

### Q4 — Tool permissions: per-installation or app-level defaults+overrides?

**Decision: Option B — per-installation only.** Each installation has its own complete set of permissions (51 tools). No app-level defaults to inherit. Different orgs can have different rules (`merge_pull_request: ask` for AcmeBooks, `: never` for chatdesk-brasil).

**Reasons:** simpler data model (no `connector_app_tool_defaults` + `connector_tool_permission_overrides` split). Schema stays as today (`connector_tool_permissions` keyed per-installation). UI is consistent with how Linear/Sentry/etc. have their permissions.

**Trade-off accepted:** mais cliques pra setar a mesma regra em 4 instalações. Aceitável porque casos comuns (uma regra por org) valem o esforço — e eles tendem a ser diferentes mesmo.

### Q5 — `app_id` na detail page: secret-style ou plain text?

**Decision: Option A — plain text + copy button.** `app_id` is technically PUBLIC (visible at github.com/apps/<your-app>). Masking it with last4 makes no sense for a 7-digit number visible to anyone.

**Reasons:** treat config as what it is. Reduces friction (no click to read). Schema reflects reality (a `inputType: 'public'` flag distinguishes it from real secrets like PEM).

**Trade-off accepted:** schema needs a field to differentiate public vs secret. Small.

## Context

After spec 0042 shipped (commit `dcfcd2a`), the dashboard listing showed 4 separate `github-app-*` rows with `0 tools` each, missing `LAST VERIFIED` timestamps, and no UI to install/manage the App. The user surfaced a deep gap inventory (35+ items across 4 tiers). This spec is the visual foundation — defining HOW the dashboard should look once the gaps are fixed. Implementation lives in specs 0044-0048.

The Paper file `zeno-agent` already has a complete design system (Foundations: palette, typography, spacing, radius, shadows; Primitives: buttons, inputs, pills, cards, dialogs, empty states, skeletons, toasts, toggle, kebab; Pages: login, home, crons, sessions, logs, settings; Connectors UI: C1-C6 + M1-M5 modais). This spec adds artboards in those existing conventions — no new foundations, no new primitives.

## Problem Statement

The dashboard has no UI for github_app:
- Catalog `customInstallComponent: 'github-app'` field exists but has no React component registered.
- Per-installation rows show as 4 rows with 0 tools (broken — install endpoint copied empty `tools[]` from the App catalog entry instead of the Personal one).
- No add/remove/rotate flow accessible from the dashboard.
- No App-level entity in the UI mental model.

This spec defines the visual targets. Specs 0044-0048 implement them.

## Non-Goals

1. **Code.** No React components, no backend endpoints, no DB schema changes. This spec is Paper artboards + this document only.
2. **always_sensitive UI.** Spec 0047 owns that flow (it's not specific to github_app).
3. **Klaviyo per-tool classification override.** Spec 0048.
4. **Activity feed visualization.** Already exists at C6 in the design system; nothing new needed.
5. **Multi-app support** (more than one GitHub App configured). Single-app for v1. The catalog id `github-app` is unique; if a future spec adds multi-app, this design extends naturally.
6. **OAuth App flow.** Deferred (different auth model — separate spec when the OAuth dance lands).

## Constraints

- **Reuse existing design system.** Mood: nocturnal/terminal. Palette: `#0B0D17` canvas, `#0E1120` surfaces, `#151824` cards, `#1E2131` borders, `#D9B362` gold accent, `#E8EAF5` text-primary, `#9DA3BD` text-secondary, `#4B4F66` text-dim, `#6BD3A3` status-active green, `#E76A6A` destructive red. Type: Fraunces serif italic for big headings, Space Grotesk body, JetBrains Mono / Geist Mono for labels and data. Iconography: SVG line icons, no emojis.
- **Naming conventions.** Page artboards use `Cn`, modals use `Mn`. New artboards continue from C7+ and M6+.
- **No new primitives.** Reuse buttons, pills, dialogs, status indicators, empty-state components defined in artboards 13-22 of the system.
- **Vertical lane alignment.** Repeated rows (installations table, discovery list) use fixed-width slots for icon, status, last-verified, kebab columns.
- **Status pill semantics.** Greens for healthy / wired / valid; ambers for warning / pending / overrides; reds for destructive / failed; gray for off / inactive. Already defined in artboards 04 + 05 of the system.
- **Type-to-confirm pattern** for destructive ops (rotate PEM, remove installation). Reuses the input primitive from artboard 14.

## Artboards delivered

10 new artboards in the Paper file `zeno-agent`. PNG snapshots (1× scale) committed to `context/specs/2026-04-27-github-app-v2-design/artboards/` with the following filenames:

- `C7-listing.png`
- `C8-app-detail.png`
- `C9-app-detail-empty.png`
- `C10-installation-detail.png`
- `M6-first-install.png`
- `M7-add-installation-auto.png`
- `M8-add-installation-manual.png`
- `M9-rotate-pem.png`
- `M10-remove-confirm.png`
- `M11-edit-env-var.png`

Two rows of new artboards on the Paper canvas.

### Row 1 — top: 12000 (extends the existing CONNECTORS UI section)

| ID | Name | Position | Resolves |
|---|---|---|---|
| `3VF-0` | C7 · `/connectors` (github-app v2 · collapsed row) | left: 0 | Brechas 3 (0 tools fix in row), 4 (LAST VERIFIED aggregated). 1 row "github-app · 4 installations · catalog" with `4/4 active` status pill. Icon has subtle "4" overlay badge differentiating from regular connectors. |
| `440-0` | C8 · `/connectors/_app/github-app` (App detail · 4 installations) | left: 1520 | Brechas 1 (entity has a home), 11 (PEM reveal/rotate accessible), 15 (app_id plain), 16 (entry point for add installation), 9 (kebab + remove per-row), 17 (test per-row). Sections: header → app config (`app_id` plain + PEM with REVEAL/ROTATE + sha256 fingerprint + last-rotated metadata + TEST ALL INSTALLATIONS) → installations section header (`+ ADD INSTALLATION` gold) → installations table → footnote about per-installation tool permissions. |
| `4DH-0` | M6 · GitHub App — first install (app_id + PEM) | left: 3040 | Brechas 1 (no install UI), 6 (no install-time validation), 19 (PEM frágil). Title hero "Add *GitHub App*". App ID input + PEM textarea with file upload + sha256 fingerprint + green "credentials valid · 4 installations available" test result strip listing the discoverable orgs as a teaser. Footer: CANCEL · TEST CONNECTION · INSTALL APP (gold). |

### Row 2 — top: 13140 (lifecycle modals)

| ID | Name | Position | Resolves |
|---|---|---|---|
| `4F0-0` | C10 · `/connectors/github-app-fnlivros` (per-installation detail) | left: 0 | Brechas 4 (LAST VERIFIED present), 7 (TEST INSTALLATION button works), 17 (per-row test). Breadcrumb shows `connectors / github-app / AcmeBooks` (App ancestor). Inherited app callout in gold ("app credentials inherited from github-app · view app ↗") + per-installation fields (installation_id + env_var with edit) + tool permissions section (51 tools · 3 categories · scoped to AcmeBooks). |
| `4MB-0` | C9 · `/connectors/_app/github-app` (App detail · empty state) | left: 1520 | Brecha 2 (UX para adicionar primeira installation). **C9 is the empty-state variant of C8** (same page, different state — positioned in Row 2 for visual grouping with lifecycle modals). Status pill amber "no installs yet". Empty state: 3 placeholder org icons with `?`, hero text "No installations yet", 2-step instructions (`1. install on a GitHub org · 2. come back to wire`), gold CTA "+ ADD YOUR FIRST INSTALLATION". |
| `4TT-0` | M7 · Add installation (auto-discover) | left: 3040 | Brechas 2 (UX add), 16 (auto-discover via /app/installations). Discovery list with 5 orgs (1 selectable + 4 already-wired with green WIRED indicator). Selected row highlighted gold. Selection preview panel: derived slug + suggested env_var (editable). Manual fallback link. Test result strip. Footer with CANCEL / TEST SELECTION / ADD INSTALLATION. |
| `4X2-0` | M8 · Add installation (manual fallback) | left: 3920 | Brecha 16 alt path. Display name + installation_id + auto-suggested env_var. "back to auto-discover" link. Test result strip. CANCEL · TEST · ADD INSTALLATION. |
| `4YH-0` | M9 · Rotate PEM (destructive) | left: 4800 | Brecha 10 (PEM rotation). Red border modal, DESTRUCTIVE pill, warning callout listing exact consequences (all 4 installations affected, env vars refresh, no undo). Current PEM masked with "WILL BE REPLACED" red label. New PEM upload + sha256 + "matches app id 12345" verification. Type-app-id-to-confirm field. Red ROTATE KEY button. |
| `503-0` | M10 · Remove installation confirm | left: 5680 | Brecha 9 (remove UX). Red border, destructive pill. "What happens" list with 2 BREAK items (env var unset, mcp tools removed) + 1 KEEP item (app credentials stay, 3 other installations unaffected). Type-installation-name-to-confirm. Red REMOVE INSTALLATION. |
| `51A-0` | M11 · Edit installation (env_var rename) | left: 6560 | Brecha 12 (rename env var without remove+re-add). Diff layout: current `ACME_GH_TOKEN` (struck through) vs new `FNLIVROS_GH_TOKEN` (gold border). Amber warning callout listing 2 skills currently referencing the old name. Footer: "applies on next worker tick (~30s)" + CANCEL / SAVE (gold). |

## Gap-to-artboard map (full traceability)

From the original gap inventory:

| Tier | # | Gap | Artboard(s) |
|---|---|---|---|
| 1 | 1 | UI custom de install não existe | M6 (first install) + M7/M8 (add installation) |
| 1 | 2 | Sem UX pra adicionar instalação | C9 (empty CTA) + M7 (auto-discover) + M8 (manual) |
| 1 | 3 | `0 tools` na linha App | C7 (App row aggregated 4/4) + C8 (each install row shows 51) |
| 1 | 4 | `LAST VERIFIED` vazio | C8 (last verified per-installation) + C10 (TEST INSTALLATION button) |
| 1 | 5 | Sem hot-reload | (Backend resolves; UI evidences via "applies on next worker tick" copy in M11; not a UI surface for v1) |
| 1 | 6 | Validação install-time | M6 (test result strip "credentials valid · N available") |
| 1 | 7 | refresh-tools quebrado | C10 TEST INSTALLATION |
| 2 | 8 | always_sensitive em yaml | (Spec 0047 — out of scope) |
| 2 | 9 | UX remover | M10 (consequence list + type-to-confirm) |
| 2 | 10 | PEM rotation | M9 (destructive flow) |
| 2 | 11 | PEM reveal pattern | C8 (REVEAL button + sha256 fingerprint + last-rotated metadata replaces last4 mask) |
| 2 | 12 | connector_update sem cache invalidate | M11 ("applies on next worker tick") |
| 2 | 13 | Health check binário | (Backend, not UI) |
| 2 | 14 | Modelo dados duplicado | (Schema decision in 0044; UI already treats App as primary entity) |
| 3 | 15 | app_id como secret errado | C8 ("App ID · public · safe to share") + M6 (label "find at github.com/apps/<your-app>") |
| 3 | 16 | installation_id auto-discover | M7 |
| 3 | 17 | Botão Test por-linha | C8 kebab + C10 TEST INSTALLATION |
| 3 | 18 | Klaviyo classification | (Spec 0048) |
| 3 | 19 | PEM validation frágil | M6/M9 ("valid PEM · sha256 …" inline check) |
| 3 | 20 | installation_id validation | M8 (numeric pattern in helper text) |
| 3 | 21 | Test e2e intercept | (Spec 0044 — backend tests) |
| 3 | 22 | Test install endpoint | (Spec 0044 — backend tests) |
| 3 | 23 | Tool list staleness | C10 (TEST INSTALLATION re-runs discoverTools per-installation) |
| 3 | 24 | Re-import flow | C9 (empty state) → M7 (auto-discover). Re-import path: if the App's installations were wiped from DB but the App stays installed on GitHub orgs, the user lands on C9 (empty state), clicks "Add installation", and M7 auto-discovers all the orgs that already have the App installed. Same flow as fresh install — no separate "Import existing" entry point needed. |
| Subtle | — | Cache stale outage | (Backend; spec 0048 surfaces failures in dashboard) |
| Subtle | — | Slug derivation reversibility | M7 ("slug → github-app-designkitchen · derived from name (locked)" prevents accidental edits) |
| Subtle | — | env_var uniqueness | M7 (auto-suggested) + M11 (rename + warning) |
| Subtle | — | Logs barulhentos | (Spec 0048) |
| Subtle | — | Visibilidade falha refresh | (Spec 0048) |

Tiers 1+2 fully visualized; Tier 3 mostly visualized (the few delegated to other specs are noted explicitly).

## Success Criteria

- All 10 artboards exist in the Paper file at the documented IDs and positions.
- Each artboard renders without clipping (heights set to `fit-content` where dynamic).
- Vertical lane alignment holds across the installations table rows (icon, env_var, tools, status, last-verified, kebab columns aligned).
- Visual review checkpoints (spacing, typography, contrast, alignment, repetition) per the Paper guide are satisfied.
- The gap-to-artboard table above is complete: every gap from tiers 1+2 has at least one artboard reference.
- Spec passes 3 review rounds with no blockers.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Implementation specs (0044-0046) deviate from these artboards | Each implementation spec includes a "visual source of truth" section citing the relevant Paper artboard ID. Reviewer (cold) verifies. |
| Paper file evolves and artboard IDs shift | IDs are stable in Paper unless the user manually deletes/recreates. **Mitigation applied:** PNG exports of all 10 artboards committed to `context/specs/2026-04-27-github-app-v2-design/artboards/` as a frozen snapshot. Downstream specs (0045/0046) reference these PNGs as fallback if the Paper file diverges. Re-export when iterating. |
| Visual decisions (e.g., "single row" choice from Q1) feel wrong once implemented | Each strategic Q has documented rationale. Iterations during implementation are allowed but require updating this spec. |
| Future GitHub App API changes (`/app/installations` shape) | M7's discovery list shape mirrors the API's payload. If the API adds new fields, the design extends columns rather than redesigning. |

## Open Questions

All resolved during brainstorming.

- **(Resolved Q1)** Listing representation: 1 collapsed row + rich detail page.
- **(Resolved Q2)** Install scope: app config only on first install; installations added separately.
- **(Resolved Q3)** Auto-discover: yes, with manual fallback.
- **(Resolved Q4)** Tool permissions: per-installation only, no app-level defaults.
- **(Resolved Q5)** `app_id`: plain text + copy button.

## Coverage gaps (acknowledged)

- **Worker-side gaps** (cache invalidation, hot-reload, log noise, refresh failure surfacing): backend concerns, no UI surface in v1. Specs 0044/0048 own them.
- **always_sensitive UI**: spec 0047 (separate, also touches non-github-app sensitive tools).
- **Klaviyo classification override UI**: spec 0048.
- **Multi-app support**: not designed for. Single-app per Zeno install.

## Review procedure

3 consecutive review rounds without findings. R1 cold reviewer (treats this as visual-only spec). R2 my own cross-check vs the Paper file (verify each artboard ID exists at the position documented). R3 fresh independent reviewer. Same protocol as 0036/0037/0038.

## Implementation order

This spec ships first; specs 0044-0048 reference it as visual SOT.

1. **0043** (this spec): visual design — artboards exist and document is committed.
2. **0044**: backend (data model decision, hot-reload via `connector_create/update/uninstall` handlers, install endpoint v2 with JWT validation, refresh-tools intercept, health check, tests). Independent of 0045.
3. **0045**: install + listing/detail UI (M6 + C7 + C8 + C10 + 0-tools fix in install endpoint payload). **Depends on 0044** (uses the new install endpoint + entity model).
4. **0046**: lifecycle UI (M7 + M8 + M9 + M10 + M11 + auto-discover endpoint). **Depends on 0045** — installations must exist before lifecycle ops can be tested. M9/M10 in particular require a populated state from 0045's install flow.
5. **0047**: always_sensitive moved to DB + dashboard editor (orthogonal — independent of 0044/0045/0046).
6. **0048**: connector polish round (Klaviyo classification override, log noise, observability). Last; depends on nothing strictly but benefits from the others being in place.

## Definition of Done

- 10 artboards committed to the Paper file at the documented positions.
- This spec.md committed to `context/specs/2026-04-27-github-app-v2-design/`.
- 3 clean reviews.
- `status: shipped` front-matter, `shipped: 2026-04-27`.
