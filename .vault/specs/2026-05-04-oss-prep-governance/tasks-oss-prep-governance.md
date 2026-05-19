---
feature: oss-prep-governance
plan: "[[plan-oss-prep-governance]]"
spec: "[[spec-oss-prep-governance]]"
created: 2026-05-04
---
# OSS-Prep — Governance + Release Flow — Tasks

**For this plan:** `[[plan-oss-prep-governance]]`

> **Execution model:** inline. Branch `chore/oss-prep-governance` (renamed from `chore/oss-prep-smoke-test`) is the working branch.

---

## Phase 1: Sanitization rule extension

### Task 1.1: Add maintainer-handle exemption to `.vault/rules/sanitization.md`

**Files:**
- Modify: `.vault/rules/sanitization.md`

- [ ] Step 1: In the `## Out of scope` section, add a new bullet (third in the list, after the canonical-remote-URL bullet and before the famous-public-OSS bullet). The exact text to append:

```markdown
- **The maintainer's public GitHub handle** as attribution. The handle (`ribeirogab`) is the same kind of public identifier as the canonical remote URL and the git author metadata; it is allowed in attribution contexts (shields.io BUILT BY badges, the Maintainership section of `GOVERNANCE.md`, references to the project's solo operator). The maintainer's real first name in narrative prose remains forbidden under category 1.
```

- [ ] Step 2: Verify nothing else in the file changed. Run `git diff .vault/rules/sanitization.md` and confirm only one bullet was added inside the `## Out of scope` section.
- [ ] Step 3: Commit:

```bash
git add .vault/rules/sanitization.md
git commit -m "docs(vault): exempt maintainer GitHub handle in sanitization rule"
```

---

## Phase 2: Governance doc + learning

### Task 2.1: Create `GOVERNANCE.md`

**Files:**
- Create: `GOVERNANCE.md`

- [ ] Step 1: Write `GOVERNANCE.md` at the repo root with this exact content:

```markdown
# Governance

This document declares how zeno-agent is maintained, versioned, and released. It is intentionally short — the project is small.

## Maintainership

zeno-agent is a personal project maintained by a single operator (`@ribeirogab`). There is no team, no SLA, no support contract. The project may be abandoned, paused, or forked at any time without notice. If you depend on it, fork it.

## Versioning

The project uses **CalVer** in the form `vYYYY.M.D` — year, month and day **without** zero-padding (e.g. `v2026.5.4`, not `v2026.05.04`). It does not use SemVer. There is no compatibility promise between tags. Tags are immutable: a published tag will never be moved or rewritten.

## Release process

Trunk-based:

1. Branch from `main` (`<type>/<slug>` — see [CONTRIBUTING.md](./CONTRIBUTING.md)).
2. Open a PR back into `main` and squash-merge.
3. Trigger `release.yml` manually — Actions tab → "Release" → **Run workflow** (or `gh workflow run release.yml`). The workflow tags today's date as `vYYYY.M.D`, pushes the tag, and creates a GitHub Release with notes auto-generated from Conventional Commits via `--generate-notes`.

The workflow inputs let the operator override the version, drop the pre-release flag, or set a custom title. After the release exists, the operator may freely edit its notes via `gh release edit <tag> --notes "..."` or via the GitHub UI — release notes are not immutable, only the tag itself is.

The workflow needs `contents: write` on the default `GITHUB_TOKEN`. If the first run fails on the tag-push step, visit `Settings → Actions → General → Workflow permissions` and switch to "Read and write permissions".

## Stability

Every release is marked **pre-release** while the project is early/experimental. The flag is dropped per-release once the maintainer is willing to call a specific snapshot stable. The README's `> [!WARNING]` block is the canonical project-wide stability signal — the per-release flag complements it but does not replace it.

## Support

Only `main` is supported. Older tags exist for historical reproducibility — checkout, build, run — but bug fixes ship in the next tag, never as a backport. If you need a fix in an old tag, fork.
```

- [ ] Step 2: Verify EN-only and no real names:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' GOVERNANCE.md
grep -nE 'Gabriel|gblosr' GOVERNANCE.md
```

Both should return zero matches. (`ribeirogab` is allowed under the rule extension committed in Task 1.1.)

- [ ] Step 3: Verify the seven-section structure. Run:

```bash
grep -nE '^(# Governance|## Maintainership|## Versioning|## Release process|## Stability|## Support)' GOVERNANCE.md
```

Expected: six matches in this order.

- [ ] Step 4: Verify line count is in the 30–80 range:

```bash
awk 'END {print NR}' GOVERNANCE.md
```

Expected: a number between 30 and 80.

- [ ] Step 5: Commit:

```bash
git add GOVERNANCE.md
git commit -m "docs: add GOVERNANCE (CalVer + trunk-based + pre-release while early)"
```

### Task 2.2: Create `.vault/learnings/release-policy-and-flow.md`

**Files:**
- Create: `.vault/learnings/release-policy-and-flow.md`

- [ ] Step 1: Write the learning with this exact content:

```markdown
---
tags:
  - learning
related:
  - "[[../specs/2026-05-04-oss-prep-governance/spec]]"
  - "[[../constitution]]"
created: 2026-05-04
---
# Release policy: CalVer + pre-release flag + trunk-based + workflow_dispatch

The release model deliberately mirrors `NousResearch/hermes-agent`: CalVer tags `vYYYY.M.D` (unpadded), GitHub-native release notes auto-generated from Conventional Commits, no SemVer, no release branches, no `CHANGELOG.md`. While the project is early/experimental every release carries the GitHub pre-release flag; the flag is dropped per-release once the maintainer is willing to call a specific snapshot stable. The release flow is automated by `.github/workflows/release.yml`, which is `workflow_dispatch`-only — manually triggered by the operator. There are no CI gates; the workflow does not run on push or pull_request.

## Context

Captured during Track F of the OSS-prep pipeline (spec `[[../specs/2026-05-04-oss-prep-governance/spec]]`, 2026-05-04). The visual model for the release page is hermes-agent's release list at https://github.com/NousResearch/hermes-agent/releases — frequent CalVer tags, GitHub-verified, with auto-generated notes. SemVer was rejected because the project has no public API contract to break-protect; pre-1.0 SemVer would communicate the same "anything can change" signal as the pre-release flag does, but with worse ergonomics for CalVer matching. Release branches were rejected because the maintainer is solo and rolling `main` plus immutable tags already provide the only support model the project promises.

## How to Apply

A future agent or maintainer brainstorming release policy should not relitigate the four anchored decisions:

1. **Do not introduce SemVer.** CalVer is the single versioning scheme. If a stability promise becomes meaningful, it ships via the pre-release flag, not via a `1.0.0` boundary.
2. **Do not introduce release branches.** Trunk-based main + immutable tags. Bug fixes for older tags are not supported — the operator forks if they need that.
3. **Do not maintain a `CHANGELOG.md` file.** GitHub Release notes generated from Conventional Commits via `--generate-notes` are the single source of changelog truth.
4. **Do not gate the release workflow on push or pull_request.** The workflow is `workflow_dispatch` only. It is not CI. If true CI ever lands in the repo, it lives in a separate workflow file.
```

- [ ] Step 2: Verify EN-only:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' .vault/learnings/release-policy-and-flow.md
```

Expected: zero matches.

- [ ] Step 3: Verify wikilinks resolve:

```bash
test -f .vault/specs/2026-05-04-oss-prep-governance/spec.md && echo OK
test -f .vault/constitution.md && echo OK
```

Expected: two `OK` lines.

- [ ] Step 4: Commit:

```bash
git add .vault/learnings/release-policy-and-flow.md
git commit -m "docs(learnings): capture CalVer + trunk-based release rationale"
```

### Task 2.3: Add learning entry to `.vault/_index/learnings.md`

**Files:**
- Modify: `.vault/_index/learnings.md`

- [ ] Step 1: Read `.vault/_index/learnings.md` to find the appropriate alphabetical or topical insertion point. The MOC groups by topic; release/governance fits under a workflow/process group if one exists, otherwise at the end of the alphabetical list.
- [ ] Step 2: Add this entry, matching the surrounding entries' format:

```markdown
- [[../learnings/release-policy-and-flow|Release policy: CalVer + pre-release flag + trunk-based + workflow_dispatch]] — anchored decisions: no SemVer, no release branches, no `CHANGELOG.md`, no CI on the release workflow.
```

- [ ] Step 3: Commit:

```bash
git add .vault/_index/learnings.md
git commit -m "docs(vault): add release-policy learning to MOC"
```

---

## Phase 3: Release workflow

### Task 3.1: Create `.github/workflows/release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] Step 1: Create the workflow with this exact content:

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Tag (e.g. v2026.5.4). Leave empty to auto-derive from today's UTC date."
        required: false
        type: string
        default: ""
      prerelease:
        description: "Mark as pre-release"
        required: false
        type: boolean
        default: true
      title:
        description: "Release title (defaults to the resolved tag)"
        required: false
        type: string
        default: ""

jobs:
  release:
    name: Tag and create GitHub Release
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Resolve tag and title
        id: resolve
        run: |
          if [ -z "${{ inputs.version }}" ]; then
            TAG="v$(date -u +%Y).$(date -u +%-m).$(date -u +%-d)"
          else
            TAG="${{ inputs.version }}"
          fi
          if [ -z "${{ inputs.title }}" ]; then
            TITLE="$TAG"
          else
            TITLE="${{ inputs.title }}"
          fi
          echo "tag=$TAG" >> $GITHUB_OUTPUT
          echo "title=$TITLE" >> $GITHUB_OUTPUT

      - name: Push tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git tag "${{ steps.resolve.outputs.tag }}"
          git push origin "${{ steps.resolve.outputs.tag }}"

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          FLAG=""
          if [ "${{ inputs.prerelease }}" = "true" ]; then
            FLAG="--prerelease"
          fi
          gh release create "${{ steps.resolve.outputs.tag }}" \
            $FLAG \
            --generate-notes \
            --title "${{ steps.resolve.outputs.title }}"
```

- [ ] Step 2: Verify the trigger is `workflow_dispatch` only. Run:

```bash
grep -nE '^on:|push:|pull_request:|schedule:|workflow_dispatch:' .github/workflows/release.yml
```

Expected: only `on:` and `workflow_dispatch:` lines. No `push:`, `pull_request:`, or `schedule:` lines.

- [ ] Step 3: Verify YAML is valid syntax. Use Node's bundled YAML parser since the repo already requires Node:

```bash
node -e "require('fs').readFileSync('.github/workflows/release.yml','utf8'); console.log('readable')"
```

Expected: prints `readable`. (A full YAML lint would need `actionlint` or similar; this step only confirms the file is readable text.)

- [ ] Step 4: Commit:

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add workflow_dispatch release flow (CalVer + auto notes)"
```

---

## Phase 4: README tweak

### Task 4.1: Add badges + WARNING block to `README.md`

**Files:**
- Modify: `README.md`

- [ ] Step 1: Read the current top of `README.md` to confirm the existing structure (H1, tagline blockquote, current `**Status:**` line).
- [ ] Step 2: Replace the current `**Status:** early / experimental — …` line with the new badges row + WARNING block. Use the `Edit` tool with this exact `old_string`:

```
**Status:** early / experimental — personal project, single-user, no SLA, no support guarantees, breaking changes expected. Use at your own risk.
```

And this exact `new_string`:

```
[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-brightgreen?style=flat-square)](./LICENSE)
[![Built By](https://img.shields.io/badge/BUILT%20BY-ribeirogab-blueviolet?style=flat-square)](https://github.com/ribeirogab)

> [!WARNING]
> **Early / experimental.** Personal project, single-user, no SLA, no support guarantees. Breaking changes expected. Use at your own risk.
```

- [ ] Step 3: Verify the badges are present and the WARNING block is the only stability statement:

```bash
grep -nE 'shields\.io|\[!WARNING\]|\*\*Status:' README.md
```

Expected: three matches — two badge lines (one for LICENSE, one for BUILT BY), and the `> [!WARNING]` line. The old `**Status:**` literal is gone.

- [ ] Step 4: Verify all eight original sections are preserved:

```bash
grep -nE '^(# zeno-agent|## What it does|## Quickstart|## What works today|## Setup notes|## Project layout|## Contributing, security, license)' README.md
```

Expected: seven matches (one H1 + six H2s) — no section was added or removed.

- [ ] Step 5: Verify EN guard and personal-id guard:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' README.md
grep -nE 'Gabriel|gblosr' README.md
```

Both should return zero matches. (The two `ribeirogab` occurrences in the new badge URL and the canonical clone URL are now both explicitly covered by the rule extension from Task 1.1.)

- [ ] Step 6: Commit:

```bash
git add README.md
git commit -m "docs(readme): add LICENSE + BUILT BY badges and WARNING alert block"
```

---

## Phase 5: Quality gate

### Task 5.1: Run quality-gate

- [ ] Step 1: Run:

```bash
pnpm run quality-gate
```

Expected: `Tasks: 28 successful, 28 total` (cached or fresh). The work in this PR is docs + a workflow file; no code touched, so cache should hit fully and the gate should be green in seconds.

---

## Phase 6: Pull request

### Task 6.1: Push branch and open the PR

- [ ] Step 1: Confirm the branch state:

```bash
git status
git log --oneline main..HEAD
```

Expected: branch `chore/oss-prep-governance`; commits cover Phases 1–4 (one per file area).

- [ ] Step 2: Push:

```bash
git push -u origin chore/oss-prep-governance
```

- [ ] Step 3: Open the PR:

```bash
gh pr create --title "chore(oss-prep): governance, release workflow, and first release setup" --body "$(cat <<'EOF'
## Summary

Track F of the OSS-prep pipeline (`tmp/oss-prep-pipeline.txt`). Declares the project's governance contract, automates the release flow with a manual-trigger Actions workflow, captures the rationale as a vault learning, tweaks the README with shields.io badges and a GitHub Alert WARNING block.

Spec: [`.vault/specs/2026-05-04-oss-prep-governance/spec.md`](https://github.com/ribeirogab/zeno-agent/blob/chore/oss-prep-governance/.vault/specs/2026-05-04-oss-prep-governance/spec.md)

## What changed

- `GOVERNANCE.md` (new) — six sections: maintainership, versioning (CalVer `vYYYY.M.D` unpadded), release process (trunk-based, `workflow_dispatch`), stability (pre-release flag while early), support (`main` only).
- `.github/workflows/release.yml` (new) — `workflow_dispatch` ONLY (not a CI gate). Three inputs: optional `version`, boolean `prerelease`, optional `title`. Uses the default `GITHUB_TOKEN` with `permissions: contents: write`.
- `.vault/learnings/release-policy-and-flow.md` (new) — atomic note recording the four anchored decisions (no SemVer, no release branches, no `CHANGELOG.md`, no CI on the release workflow) and the hermes-agent visual model.
- `.vault/_index/learnings.md` — adds the new learning to the MOC.
- `.vault/rules/sanitization.md` — small extension to `## Out of scope`: the maintainer's public GitHub handle (`ribeirogab`) is allowed in attribution contexts. Real first name in prose remains forbidden under category 1.
- `README.md` — adds two badges (LICENSE + BUILT BY) directly under the title; replaces the `**Status:**` single-sentence line with a `> [!WARNING]` alert block of identical wording.

## Manual operator actions (post-merge)

The PR cannot be considered closed until the first release is shipped, exercising the workflow end-to-end.

- [ ] Trigger the first release: `gh workflow run release.yml -f prerelease=true` (or via Actions UI). The workflow auto-derives `v2026.5.4` from today's UTC date.
- [ ] Verify: `gh release view v2026.5.4` returns the release object with `isPrerelease: true` and a non-empty `body`.
- [ ] Verify the repo's `Releases` page shows `v2026.5.4` with the orange Pre-release badge.
- [ ] If the workflow fails on the tag-push step with a permissions error, set `Settings → Actions → General → Workflow permissions` to "Read and write permissions" and re-run.

## Test plan

- [x] `pnpm run quality-gate` is green (28/28 tasks).
- [x] `grep -E '^on:|push:|pull_request:|schedule:|workflow_dispatch:' .github/workflows/release.yml` shows only `on:` and `workflow_dispatch:` (NOT a CI gate).
- [x] EN guard clean: `grep -rnE '\b(você|porquê|nessa|também|então|usuário|configura)\b' GOVERNANCE.md .vault/learnings/release-policy-and-flow.md README.md .github/workflows/release.yml` returns zero matches.
- [x] Sanitization guard: `grep -rnE 'Gabriel|gblosr' GOVERNANCE.md .vault/learnings/release-policy-and-flow.md README.md .github/workflows/release.yml` returns zero matches. (`ribeirogab` is allowed under the rule extension shipped in this PR.)
- [x] All wikilinks in the new learning resolve.
- [x] README preserves the eight-section structure shipped in PR #3.
- [ ] **Operator action** — first release `v2026.5.4` shipped via `gh workflow run release.yml`.
EOF
)"
```

- [ ] Step 4: Wait for operator approval before merge.

---

## Phase 7: First release (post-merge, manual operator action)

### Task 7.1: Trigger the first release after merge

This task runs **after** the PR is merged into `main`. It is documented here for the operator's reference.

- [ ] Step 1: Sync local `main`:

```bash
git checkout main
git pull
```

- [ ] Step 2: Trigger the release workflow:

```bash
gh workflow run release.yml -f prerelease=true
```

(Or via the Actions UI: Actions tab → "Release" workflow → "Run workflow" button → leave defaults → press the green button.)

- [ ] Step 3: Wait for the workflow run to complete:

```bash
gh run list --workflow=release.yml --limit 1
gh run watch
```

Expected: success (green).

- [ ] Step 4: Verify the release object:

```bash
gh release view v2026.5.4
```

Expected: `isPrerelease: true`, non-empty `body` (auto-generated changelog), tag `v2026.5.4` pointing at the latest `main` commit.

- [ ] Step 5: Verify on the GitHub UI: `https://github.com/ribeirogab/zeno-agent/releases` shows `v2026.5.4` with the orange "Pre-release" badge and the auto-generated notes grouped by Conventional Commits type.

- [ ] Step 6: If the changelog is too verbose to be useful (the first release covers all of repo history), edit:

```bash
gh release edit v2026.5.4 --notes-file -<<'EOF'
First public pre-release of zeno-agent. See `GOVERNANCE.md` for the project's release policy. Following releases will carry per-release changelogs auto-generated from commits since the previous tag.
EOF
```
