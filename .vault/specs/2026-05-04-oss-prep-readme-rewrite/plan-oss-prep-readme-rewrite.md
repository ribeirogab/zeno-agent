---
feature: oss-prep-readme-rewrite
spec: "[[spec-oss-prep-readme-rewrite]]"
created: 2026-05-04
---
# OSS-Prep — README Rewrite — Plan

**For this spec:** `[[spec-oss-prep-readme-rewrite]]`

## Approach

Single-file rewrite. Replace `README.md` end-to-end with the new minimal structure declared in the spec's Acceptance Criteria. No surgical edits to the existing file — overwrite. Verify against the spec checklist (sections present, sanitization clean, links resolve, line count in range), run the quality-gate as a smoke test, push, open the PR.

Inline execution. The work is one file; subagents add overhead without parallelism.

## Architecture

```
Phase 1: Rewrite README.md       → README.md (overwrite)
  └─ 8 sections, ~60-80 lines

Phase 2: Verification             → grep guards + link resolution checks
  ├─ EN guard
  ├─ sanitization guard
  ├─ link resolution
  └─ line count check

Phase 3: Quality gate             → pnpm run quality-gate
  └─ smoke test that rewrite did not break workspace tooling

Phase 4: PR                       → gh pr create on chore/oss-prep-readme
```

## File Structure

**Modified:**
- `README.md` — overwritten with the 8-section minimal structure (`# zeno-agent` + tagline blockquote, `**Status**`, `## What it does`, `## Quickstart`, `## What works today`, `## Setup notes`, `## Project layout`, `## Contributing, security, license`).

**Untouched:**
- Everything else. No changes to `.vault/`, `apps/`, `packages/`, `agent/`, `infra/`, top-level config files, community files (`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`), or `.github/` templates.

## Phase Ordering

| Phase | Depends on | Parallelism |
|---|---|---|
| 1 — Rewrite | nothing | sequential, single file |
| 2 — Verification | Phase 1 done | grep + filesystem checks |
| 3 — Quality gate | Phases 1–2 done | single `pnpm` run |
| 4 — PR | Phase 3 green | single `gh pr create` |

## Risks / Open Decisions

- **"What works today" list drift.** Mitigation: keep the list short and concrete. The spec accepts 5–8 items; pick the most user-visible.
- **Line count slips above 100.** Mitigation: spec is a soft cap. If the rewrite genuinely needs 105 lines, ship it; do not pad or trim for the metric.
- **Quickstart has a typo or missing step.** Mitigation: dry-run the commands mentally against the existing scripts; the only real change from the existing README is removing the migration block and the GitHub PAT prerequisite.
- **Removing the troubleshooting table orphans the maintainer's own muscle memory.** Mitigation: the deleted content survives in git history and can be ported into `apps/docs` when that ships.
