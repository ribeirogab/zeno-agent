---
feature: design-md-format
spec: "[[spec-design-md-format]]"
created: 2026-04-30
---
# DESIGN.md Format Adoption — Plan

**For this spec:** `[[spec-design-md-format]]`

## Approach

Adopt the [Google Labs DESIGN.md format](https://github.com/google-labs-code/design.md) as the canonical, machine-readable + human-readable design system spec for Zeno. The new file lives at repo root next to `CLAUDE.md` / `AGENTS.md` / `constitution.md`. Tokens are extracted verbatim from `packages/ui/src/styles/tokens.css` (colors, status, surfaces, gold accent) and `apps/dashboard/src/styles/globals.css` (font families). Prose is authored fresh — the existing `packages/ui/DESIGN.md` describes the discontinued "Hearty island / coral" brand and is unsalvageable.

The Google `@google/design.md` CLI is added as an opt-in linter (NOT in `quality-gate`, since the format is alpha). The format itself is vendored into `context/conventions/design-md-format.md` at a pinned commit SHA, so agents can reference it offline and the doc remains useful even if the npm dep is dropped later.

A canonical-source rule + a learning note close the loop: DESIGN.md becomes the SoT for tokens, `tokens.css` is treated as derived (manually synced), and the failure mode of the old per-frame Paper registry is captured for future reference.

## Architecture

```
zeno-agent/
├── DESIGN.md                                   ← NEW (root) — canonical spec
├── CLAUDE.md                                   ← MODIFY (one-line pointer)
├── AGENTS.md                                   ← MODIFY (one-line pointer)
├── package.json                                ← MODIFY (devDep + scripts)
├── pnpm-lock.yaml                              ← AUTO (install side effect)
├── packages/ui/
│   ├── DESIGN.md                               ← DELETE (stale)
│   └── src/styles/tokens.css                   ← MODIFY (header comment)
└── context/
    ├── conventions/
    │   └── design-md-format.md                 ← NEW (vendored google-labs spec)
    ├── rules/
    │   ├── design-md-canonical.md              ← NEW (canonical-source rule)
    │   └── ui-in-paper.md                      ← MODIFY (remove DESIGN.md refs)
    ├── learnings/
    │   └── per-frame-design-registry-failure.md ← NEW (lesson note)
    └── _index/
        ├── conventions.md                      ← MODIFY (link)
        ├── rules.md                            ← MODIFY (link)
        └── learnings.md                        ← MODIFY (link)
```

Data flow:

- **Authoring:** humans (and agents) edit `DESIGN.md` first. Tokens go into the YAML frontmatter; intent/rationale into the markdown body.
- **Code sync:** `packages/ui/src/styles/tokens.css` is updated in the **same commit** as DESIGN.md. The two must match exactly — convention rule enforces.
- **Lint (opt-in):** `pnpm run design:lint` runs `@google/design.md` against DESIGN.md. Findings (broken refs, contrast warnings, orphans) are JSON. Manual run; not in quality-gate.
- **Diff/export (opt-in):** `pnpm run design:diff` and `pnpm run design:export-tailwind` available for review/export use cases.
- **Discovery:** CLAUDE.md and AGENTS.md point to DESIGN.md. `tokens.css` header comment also points back.

## File Structure

| File | Verb | Responsibility |
|---|---|---|
| `DESIGN.md` (root) | create | Canonical design system: YAML tokens + 8 sections + 1 "Source of truth" extra |
| `context/conventions/design-md-format.md` | create | Vendored Google Labs format spec at pinned SHA `8ecd4645b957e6a683a05fb9c79cd6c9028873d0` |
| `context/rules/design-md-canonical.md` | create | DESIGN.md is SoT for tokens; tokens.css derives; update DESIGN.md first |
| `context/learnings/per-frame-design-registry-failure.md` | create | What the old DESIGN.md tried, why it failed, why structured tokens are the next attempt |
| `context/_index/conventions.md` | modify | Add link to design-md-format |
| `context/_index/rules.md` | modify | Add link to design-md-canonical (severity: important) |
| `context/_index/learnings.md` | modify | Add link to per-frame-design-registry-failure |
| `context/rules/ui-in-paper.md` | modify | Remove `packages/ui/DESIGN.md` registry references; update Paper file ID; new navigation model (route containers + sidebar, no per-frame URL list) |
| `package.json` (root) | modify | devDep `@google/design.md` (exact version) + 3 scripts (`design:lint`, `design:diff`, `design:export-tailwind`) |
| `pnpm-lock.yaml` | auto | Side effect of `pnpm install` |
| `CLAUDE.md` (root) | modify | One-line UI pointer to DESIGN.md |
| `AGENTS.md` (root) | modify | Mirror of CLAUDE.md pointer |
| `packages/ui/src/styles/tokens.css` | modify | Header comment cites DESIGN.md as canonical source |
| `packages/ui/DESIGN.md` | delete | Stale brand + dead Paper-frame registry |

## Phase Ordering

1. **Tooling.** Install `@google/design.md` and add scripts. Earliest because the rest of the work uses `pnpm run design:lint` to validate output.
2. **Vault.** Vendor the format spec; author rule, learning, and update indexes; update the now-stale `ui-in-paper` rule. The vendored spec is reference material that informs how DESIGN.md is authored.
3. **Author DESIGN.md.** Extract token values from `tokens.css` + `globals.css`. Write all 8 sections + 1 "Source of truth" extra. Lint until clean.
4. **Cross-references.** Wire `CLAUDE.md`, `AGENTS.md`, `tokens.css` header. Delete `packages/ui/DESIGN.md`.
5. **Verification.** `pnpm run design:lint` clean. `pnpm run quality-gate` green. Manual sanity check.
6. **Three-round final review** per Rule 2 of the contract.
7. **PR.**

## Risks / Open Decisions

- **`@google/design.md` alpha format break.** Pin exact version; document fallback in `design-md-canonical` rule (drop dep, keep DESIGN.md as plain markdown).
- **DESIGN.md ↔ tokens.css drift.** Manual contract via canonical-source rule. Future spec may add a custom drift-checker script if drift becomes a real problem.
- **`ui-in-paper` rule was tightly coupled to old DESIGN.md.** Rewriting the "What the rule requires" section to remove per-frame registry; replacing with route-container navigation model. Already decided above; no open question.
- **No `design:lint` in `quality-gate`.** Conscious choice; revisit after format hits beta and ~20 PRs without false positives.
- **Vendored format spec rot.** Header comment with SHA + upgrade procedure; treated as snapshot, not live mirror.
