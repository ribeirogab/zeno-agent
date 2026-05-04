---
feature: oss-prep-governance
spec: "[[spec]]"
created: 2026-05-04
---
# OSS-Prep — Governance + Release Flow — Plan

**For this spec:** `[[spec]]`

## Approach

Mostly mechanical. Six file edits, all small, all sequenced in a single inline session. The order matters once: the sanitization rule extension lands first so the README badge and `GOVERNANCE.md` Maintainership section are written into a tree where the rule already exempts handle-as-attribution. Everything else is independent.

The release workflow is the largest single artefact (~40 lines of YAML); it is also the only file that requires care to keep `workflow_dispatch:` as the sole trigger and avoid any push/PR/schedule events leaking in.

The first release (`v2026.5.4`) is a manual operator step after merge — declared as an acceptance criterion in the spec but not a file deliverable.

## Architecture

```
Phase 1: Sanitization rule extension     → vault/rules/sanitization.md (mod)
  └─ adds one bullet to Out of scope

Phase 2: Governance doc + learning       → GOVERNANCE.md (new)
  ├─ vault/learnings/release-policy-and-flow.md (new)
  └─ vault/_index/learnings.md (mod, add entry)

Phase 3: Release workflow                → .github/workflows/release.yml (new)
  └─ workflow_dispatch only, three inputs

Phase 4: README tweak                    → README.md (mod)
  ├─ add LICENSE + BUILT BY badges row
  └─ replace **Status:** sentence with > [!WARNING] block

Phase 5: Quality gate                    → pnpm run quality-gate
  └─ confirm 28/28 tasks succeed

Phase 6: PR                              → gh pr create
  └─ branch chore/oss-prep-governance, lists v2026.5.4 first-run as operator action

Phase 7: First release (post-merge,      → gh workflow run release.yml
   manual operator step)
```

## File Structure

**Created:**
- `GOVERNANCE.md` — root file declaring maintainership, versioning (CalVer unpadded), release process, stability, support.
- `.github/workflows/release.yml` — `workflow_dispatch` only; three inputs (`version`, `prerelease`, `title`); uses `${{ github.token }}`; `permissions: contents: write`.
- `vault/learnings/release-policy-and-flow.md` — atomic note from the project's `vault/templates/learning.md` template; preserves the four anchored decisions and rationale.

**Modified:**
- `vault/rules/sanitization.md` — adds one bullet to `## Out of scope` covering the maintainer's public GitHub handle in attribution contexts.
- `vault/_index/learnings.md` — adds a one-line entry for the new learning.
- `README.md` — adds two-badge row directly under H1 + tagline blockquote; replaces the `**Status:**` single sentence with a `> [!WARNING]` block of identical wording.

**Untouched:**
- All shipped community files (`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`).
- Code workspaces (`apps/`, `packages/`, `agent/`, `infra/`).
- Vault content other than the three files above.
- `package.json` `version` field — stays at the current placeholder; the git tag is the single source of truth.

## Phase Ordering

| Phase | Depends on | Parallelism |
|---|---|---|
| 1 — Rule extension | nothing | sequential, single edit |
| 2 — GOVERNANCE + learning + MOC entry | Phase 1 (so the new doc references a rule that already covers attribution) | sequential, three small edits |
| 3 — Release workflow | nothing (independent of vault changes) | sequential |
| 4 — README tweak | Phase 1 (badges depend on rule extension) | sequential |
| 5 — Quality gate | Phases 1–4 | single command |
| 6 — PR | Phase 5 green | single command |
| 7 — First release | PR merged | single `gh workflow run` command (operator action) |

## Risks / Open Decisions

- **Workflow's `--generate-notes` produces enormous changelog on first run** because there is no prior tag. Mitigation: operator reviews and may edit via `gh release edit v2026.5.4 --notes "..."`. Acceptance criterion does not require trimmed notes; the verbose changelog is acceptable.
- **Repo workflow permissions default may be read-only.** GitHub flipped this default for some account tiers. If the workflow fails with "permission denied" on the tag push step, the operator must visit `Settings → Actions → General → Workflow permissions` and switch to "Read and write permissions". This setup note is documented inside `GOVERNANCE.md`.
- **`%-m` / `%-d` `date` flags are GNU-only.** Not portable to BSD `date` (macOS). The workflow runs on the GitHub Actions Ubuntu runner which has GNU `date`, so the flag is correct in context. If a future fork wants to run the same workflow on macOS, it will need an alternative.
- **Branch was created as `chore/oss-prep-smoke-test`** (Track G, parked). It has been renamed to `chore/oss-prep-governance` before any work begins.
- **`.github/workflows/release.yml` is the first GitHub Actions file in the repo.** It does not introduce CI gates (no `push:` / `pull_request:` triggers), but it is worth noting in the PR body so reviewers do not mistake it for a quality-gate change.
