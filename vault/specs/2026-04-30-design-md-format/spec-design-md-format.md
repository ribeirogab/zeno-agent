---
status: draft
feature: design-md-format
created: 2026-04-30
shipped: null
---
# DESIGN.md Format Adoption — Spec

**Status:** Draft
**Scope:** Replace the stale `packages/ui/DESIGN.md` with a canonical `DESIGN.md` at repo root following the [Google Labs DESIGN.md format](https://github.com/google-labs-code/design.md), authored from the actual values shipping in `packages/ui/src/styles/tokens.css` + `apps/dashboard/src/styles/globals.css`. Vendor the format spec at a pinned commit. Provide opt-in linter scripts. Document the canonical-source contract.

## Context

Two facts make this spec necessary:

1. **The current `packages/ui/DESIGN.md` actively misleads agents.** It describes brand "Hearty island" with coral accent `#e66b3d` and dual light/dark palettes, pointing at a Paper file `01KPA7BZ1AWQDRA79KQYGDA6V7`. The code that actually ships defines brand "Imperial Terminal" with gold accent `#d9b362`, **dark only**, and the live Paper file is `01KPYCJ6QXK8Z1PEVQME9262RP` ("zeno-agent"). Any agent reading the doc gets a fictional brand.
2. **It's also a Paper↔code frame registry, not a design-system spec.** The recent Paper file refactor (route-based containers) made the per-frame URLs partially obsolete. That registry pattern proved fragile across Paper restructures.

Google Labs released a structured `DESIGN.md` format (alpha) with YAML frontmatter tokens + 8 canonical markdown sections + a CLI (`lint`, `diff`, `export`). Tokens are inspired by W3C DTCG and convertible to Tailwind theme. The format is parseable by agents without custom prompt engineering.

Zeno's only UI surface today is the dashboard. One DESIGN.md at repo root is sufficient and mirrors Google's pattern — same level as `CLAUDE.md`, `AGENTS.md`, and `constitution.md`.

## Problem Statement

Without a structured, accurate, single-source design spec, agents make UI changes from fictional or inconsistent docs. Drift between code (`tokens.css`) and doc is silent and growing. The old DESIGN.md fails simultaneously as a brand spec (wrong values), a token registry (no machine-readable tokens), and a Paper map (URLs go stale on restructures).

## Non-Goals

- **Auto-generating** `tailwind.config` or `tokens.css` from DESIGN.md. (Future spec if drift becomes a real problem.)
- **Light-mode tokens.** Dark is canonical in code and Paper; there is no light palette to author.
- **Full component variant inventory.** Components section is scoped to archetypes (`button-primary`, `pill`, `dialog-surface`, etc.), not every shadcn primitive permutation.
- **Putting `design:lint` in the `quality-gate`.** `@google/design.md` is alpha; gating production CI on alpha tooling is the textbook anti-pattern. Keep it as an opt-in script.
- **Rebuilding the per-frame Paper↔code registry.** That pattern failed; the Paper sidebar (post-refactor) is the navigation tool now.
- **Migrating other Zeno docs** (SOUL.md, USER.md, ZENO learnings) to structured formats.

## Constraints

- `@google/design.md` is `version: alpha`. Pin **exact** version (no `^`, no `~`). If the format breaks incompatibly in a future release, the contingency is to drop the dep and keep DESIGN.md as plain markdown — the doc value is independent of the linter.
- DESIGN.md frontmatter tokens **must exactly match** the values in `packages/ui/src/styles/tokens.css` (and font tokens in `apps/dashboard/src/styles/globals.css`). Drift is forbidden by convention rule.
- Vendored format spec must reference a pinned commit SHA in its header comment. Treat it as a snapshot, not a live mirror.
- No code generation in this spec. Manual contract only.

## User Stories / Scenarios

1. **Agent UI task.** Claude (or another agent) is asked to add a new dashboard page. Agent reads `/DESIGN.md` once, gets brand, palette, type scale, component archetypes, and Do's/Don'ts in a single structured pass — no CSS variable spelunking.
2. **Token change.** Maintainer wants to nudge gold accent. They edit `DESIGN.md` frontmatter first, then update `packages/ui/src/styles/tokens.css` in the same commit. Convention rule documents the order.
3. **Pre-merge sanity.** Reviewer runs `pnpm run design:lint`; sees structured JSON findings (broken refs, contrast issues, orphan tokens). Decides what to act on.
4. **Future export.** Operator decides to ship a marketing site or auto-generated Tailwind theme; runs `pnpm run design:export-tailwind` to bootstrap.
5. **Stale-doc audit.** New contributor opens repo, finds `DESIGN.md` at root next to `CLAUDE.md`. Trusts it because it has YAML tokens that can be diffed against code.

## Success Criteria

**File deliverables (root):**
- [ ] `DESIGN.md` at repo root, structurally valid per Google Labs spec.
- [ ] YAML frontmatter tokens match `tokens.css` (colors) + `globals.css` (fonts) exactly.
- [ ] 8 canonical sections present in correct order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.
- [ ] One extra section "Source of truth" with single Paper file URL — no per-frame URLs.
- [ ] Components section restricted to archetypes (≤ 8 entries).

**Removed:**
- [ ] `packages/ui/DESIGN.md` deleted.

**Tooling (root `package.json`):**
- [ ] `@google/design.md` installed as devDep at pinned exact version.
- [ ] `pnpm run design:lint` → `npx @google/design.md lint DESIGN.md`.
- [ ] `pnpm run design:diff <before> <after>` available.
- [ ] `pnpm run design:export-tailwind` available.
- [ ] **Not** added to `quality-gate`.

**Vault:**
- [ ] `context/conventions/design-md-format.md` — vendored copy of `google-labs-code/design.md@8ecd4645b957e6a683a05fb9c79cd6c9028873d0/docs/spec.md`. Header comment documents the SHA + upgrade procedure.
- [ ] `context/rules/design-md-canonical.md` — DESIGN.md is the canonical source for tokens; on any token change, DESIGN.md updates first; tokens.css follows in the same commit.
- [ ] `context/learnings/per-frame-design-registry-failure.md` — captures what the old DESIGN.md tried, why it failed (fictional brand + stale Paper URLs), and the new direction.
- [ ] `context/_index/conventions.md` and `context/_index/rules.md` updated to link the new entries.
- [ ] `context/_index/learnings.md` updated to link the new learning.

**Cross-references:**
- [ ] `CLAUDE.md` adds a one-line pointer: "When working on UI, read `/DESIGN.md` first."
- [ ] `AGENTS.md` mirrors the same pointer.
- [ ] `packages/ui/src/styles/tokens.css` header comment cites `/DESIGN.md` as the canonical source.

**Verification:**
- [ ] `pnpm run design:lint` exits `0` (structurally valid; warnings allowed but documented).
- [ ] `pnpm run quality-gate` green (unchanged).
- [ ] Smoke check: open `DESIGN.md`, verify gold `#d9b362` and dark-only narrative match what's on screen in the dashboard.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `@google/design.md` alpha format breaks in a future release | Pin exact version. If broken: delete the dep; DESIGN.md remains useful plain-markdown content. Document the fallback in the canonical-source rule. |
| DESIGN.md and `tokens.css` drift silently | Convention rule (`design-md-canonical`) makes the order explicit; reviewers and agents both check. Future spec can add a custom drift-checker if manual contract proves insufficient. |
| Spec adds a third source of truth (Paper, code, DESIGN.md) → triangle drift | DESIGN.md is positioned as the *normative tokens + intent prose*, Paper is the *visual SoT for layout*, code is *derived*. Rule documents the arrows. Each artifact has one job. |
| Agents reproduce stale Paper frame URLs in the new doc | Spec explicitly forbids per-frame URLs; only the Paper file root URL is included. |
| Lint warnings (e.g., contrast on gold-on-canvas pairs) cause noise | Standalone script, not gating CI. First lint run results documented in the spec post-impl; warnings triaged before merge. |
| Vendored format spec rots vs upstream | Header comment with commit SHA + upgrade procedure (re-vendor + diff before bumping the dep). |

## Open Questions

None at draft stage. Decisions captured above are owner calls under Rule 4 of `tmp/zeno-cleanup-contract.md`.
