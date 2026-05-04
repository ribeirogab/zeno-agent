---
status: draft
feature: oss-prep-governance
created: 2026-05-04
shipped: null
---
# OSS-Prep — Governance + Release Flow — Spec

**Status:** Draft
**Scope:** Declare the project's governance contract (maintainership, versioning, release process, stability signal, support model), automate the release flow with a `workflow_dispatch` GitHub Actions workflow, capture the rationale as a vault learning, tweak the README with shields.io badges and a GitHub Alert for the stability disclaimer, and ship the first CalVer pre-release tag (`v2026.5.4`) as a manual operator action post-merge.

## Context

Tracks A (PR #1), B (PR #2), and D (PR #3) of the OSS-prep pipeline have shipped. Track G (fresh-clone smoke test) is parked at the operator's request. The repo is now content-clean, license-correct, community-onboarded, and outsider-friendly — but it still has no release policy, no tags, and no declared support contract. Outsiders cannot pin against a known-good version, and there is no anchor for "what changed when".

Track F is the next item in `tmp/oss-prep-pipeline.txt`. It does three things at once because they are tightly coupled and would otherwise generate three thin specs:

1. **Govern**: declare the rules (CalVer, trunk-based, pre-release flag while early, only `main` supported).
2. **Automate**: a manual-trigger Actions workflow (`workflow_dispatch`) that does the right `gh release create` invocation so the operator never has to remember the flags.
3. **Tag**: cut the first release `v2026.5.4` as a pre-release, exercising the new flow end-to-end.

The release pattern is a deliberate copy of `NousResearch/hermes-agent` (CalVer `vYYYY.M.D`, GitHub-native release notes, no SemVer), adapted with the pre-release flag while Zeno is early. README badges (LICENSE + BUILT BY) match the same project's visual identity.

## Problem Statement

Without an explicit governance contract:

1. There is no version anchor — outsiders cannot pin or reproduce a known-good Zeno; "rolling `main`" is the implicit policy but it is not declared anywhere.
2. There is no release process documented — when the operator wants to ship a release, they have to remember the right `gh release create` flags, the prerelease semantics, the changelog flag, the title format. Drift is inevitable.
3. There is no support contract — outsiders may file issues against an old `main` SHA and assume the maintainer will backport. They will not.
4. The README's `**Status:** early / experimental` line is a single sentence buried at the top — easy to miss. It needs both a glance-able badge row and a salient WARNING block.
5. Future maintainers (human or agent) brainstorming release policy will redo the CalVer-vs-SemVer / pre-release-vs-stable-flag debate from scratch unless the rationale is captured.

## Non-Goals

- **No CI gates.** This spec adds a single GitHub Actions workflow that runs ONLY on `workflow_dispatch` (manual trigger). It does not gate PRs, does not lint, does not test, does not run on push. The "no CI" decision from Track A stands.
- **No SemVer.** CalVer only. Compatibility between tags is not promised.
- **No release branches.** Rolling `main`. No hotfix branches, no `develop` branch.
- **No backports.** Bug fixes ship in the next tag from `main`. Old tags are immutable historical references.
- **No `CHANGELOG.md` file.** Release notes live on GitHub Release objects, auto-generated from Conventional Commits via `gh release --generate-notes`. The repo does not maintain a parallel changelog.
- **No GPG-signed tags.** Possible future addition; out of scope here.
- **No Docker image build/push as part of release.** Possible future addition; the current workflow only creates the tag and the release object.
- **No `package.json` `version` field synchronisation** with the CalVer tag. The git tag is the single source of truth; `package.json.version` stays at its current placeholder.
- **No edits to `CONTRIBUTING.md` or other community files.** Track B's contracts stand. `GOVERNANCE.md` is additive.
- **One small extension to `vault/rules/sanitization.md`** — adds an "out of scope" bullet for the maintainer's public GitHub handle as attribution. This is not a non-goal; it is required for the BUILT BY badge and `GOVERNANCE.md`'s Maintainership section to be unambiguously rule-compliant.

## Constraints

- **Vault language is English-only** (locked Track A). All committed files are EN.
- **No real personal identifiers in committed prose** (per `vault/rules/sanitization.md`). The maintainer's GitHub handle (`ribeirogab`) is public attribution equivalent to git authorship and the canonical remote URL. To make this explicit and avoid future audit ambiguity, this spec extends `vault/rules/sanitization.md`'s `## Out of scope` section with an additional bullet: "**The maintainer's public GitHub handle** — appearing in attribution contexts (e.g. shields.io BUILT BY badges, the Maintainership section of `GOVERNANCE.md`, the `@ribeirogab` mention as the project's solo operator). It is the same kind of public attribution as the canonical remote URL and git author metadata. The maintainer's real first name in narrative prose remains forbidden under category 1." With that clause in place, the handle appears in:
  - The `BUILT BY ribeirogab` badge in the README.
  - The "Maintainership" section of `GOVERNANCE.md`.
  Both are now explicitly covered by the rule, not by analogy.
- **GitHub Actions permissions.** The release workflow requires `contents: write` to push tags and create releases. Declared explicitly in the workflow's `permissions:` block. Repo-level token permissions (Settings → Actions → General → Workflow permissions) must allow this, but no repo settings need changing if the default `read and write` permissions are in place.
- **First release timing.** The workflow is shipped in this PR but the first run (`v2026.5.4`) happens after merge. The PR body lists this as a manual operator action checkbox.
- **CalVer day field**: the workflow auto-derives `vYYYY.M.D` from the runner's UTC date. Operator can override via the workflow input.
- **Single PR.** All deliverables (governance doc + workflow + learning + README tweak) ship together.

## User Stories / Scenarios

1. **An outsider opens the repo's `Releases` tab.** They see a list of `vYYYY.M.D` pre-release entries with auto-generated release notes grouped by Conventional Commits type. They can pin `git checkout v2026.5.4` for a reproducible snapshot.
2. **The maintainer wants to ship a release after merging a PR.** They go to the Actions tab → "Release" workflow → "Run workflow" → leave defaults → press the button. The workflow tags today's date as a pre-release with auto-generated notes. No CLI required.
3. **A future agent (Claude/Codex/Cursor) is asked "should I create a `release/v2026.6.1` branch for the next release?"** It reads `GOVERNANCE.md`, sees "trunk-based, no release branches", and answers "no — tag from `main` directly".
4. **An outsider sees the README** and immediately notices the LICENSE + BUILT BY badges plus the WARNING alert block. They calibrate expectations before reading further.
5. **The maintainer wants to remember why CalVer was chosen** months from now when they consider switching. They read `vault/learnings/release-policy-and-flow.md` and find the rationale.

## Acceptance Criteria

### `vault/rules/sanitization.md` (small extension)

- [ ] The `## Out of scope` section gains one additional bullet covering the maintainer's public GitHub handle as attribution (`ribeirogab` in BUILT BY badges, Maintainership sections, etc.). The maintainer's real first name in narrative prose remains forbidden under category 1; only the handle is exempted, and only in attribution contexts.
- [ ] No other change to the rule. Frontmatter and other sections preserved.

### `GOVERNANCE.md`

- [ ] `GOVERNANCE.md` exists at the repo root with these top-level sections, in this order: `# Governance`, `## Maintainership`, `## Versioning`, `## Release process`, `## Stability`, `## Support`. No other top-level sections.
- [ ] `Maintainership` states: single operator (`@ribeirogab`); personal project; may be abandoned at any time without notice; no SLA.
- [ ] `Versioning` states: CalVer `vYYYY.M.D` (year, then month and day without zero-padding — e.g. `v2026.5.4`, not `v2026.05.04`); not SemVer; no compatibility promise between tags; tags are immutable.
- [ ] `Release process` documents the trunk-based flow: feature branch → PR → squash-merge to `main` → trigger `release.yml` workflow via Actions UI or `gh workflow run release.yml`. Notes auto-generated from Conventional Commits. Two operational notes appear in the same section: (1) the operator may edit release notes after the fact via `gh release edit <tag> --notes "..."` or via the GitHub UI, and (2) the workflow requires the repo's `Settings → Actions → General → Workflow permissions` to be set to "Read and write permissions" for the default `GITHUB_TOKEN` to push tags.
- [ ] `Stability` states: every release is marked pre-release while the project is early/experimental; the flag is dropped per-release once the maintainer decides a release is stable; the README's WARNING block is the canonical project-wide stability signal.
- [ ] `Support` states: only `main` is supported; old tags exist for historical reproducibility; bug fixes ship in the next tag, never backported.
- [ ] File is fully in English. `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' GOVERNANCE.md` returns zero matches.
- [ ] File length is between 30 and 80 lines (soft cap; the rules are short).

### `.github/workflows/release.yml`

- [ ] File exists with `name: Release`.
- [ ] The only trigger is `workflow_dispatch`. There is no `push:`, no `pull_request:`, no `schedule:` block. Verifiable: `grep -E 'on:|push:|pull_request:|schedule:' .github/workflows/release.yml` shows only the `on:` line and `workflow_dispatch:` block.
- [ ] Workflow accepts three inputs: `version` (string, optional, default empty → workflow auto-derives today's CalVer), `prerelease` (boolean, default `true`), `title` (string, optional, default = the resolved version).
- [ ] Job declares `permissions: contents: write` to allow tag push and release creation.
- [ ] Job runs `actions/checkout@v4` with `fetch-depth: 0` (full history needed for `--generate-notes`).
- [ ] Tag-derivation step: if input `version` is empty, computes `v$(date -u +%Y).$(date -u +%-m).$(date -u +%-d)`; otherwise uses the input verbatim. Sets the result as a job-level output.
- [ ] Tag is pushed to origin via `git push origin <tag>`.
- [ ] Release is created via `gh release create <tag> --generate-notes --title "<title>"`, with `--prerelease` appended conditionally based on the boolean input.
- [ ] Workflow uses `${{ github.token }}` for `gh` auth (no PAT, no secrets to configure).

### `vault/learnings/release-policy-and-flow.md`

- [ ] File exists with frontmatter matching `vault/templates/learning.md`: `tags: [learning]`, `related: [[../specs/2026-05-04-oss-prep-governance/spec]] [[../constitution]]`, `created: 2026-05-04`.
- [ ] Body has these sections in order: H1 + one-paragraph technical insight, `## Context`, `## How to Apply`. The H1 reads "Release policy: CalVer + pre-release flag + trunk-based + workflow_dispatch".
- [ ] The insight paragraph names all four anchored decisions: CalVer (not SemVer), pre-release flag while early, trunk-based (no release branches), `workflow_dispatch` for release automation.
- [ ] `## Context` cites Track F's spec and the hermes-agent reference (`https://github.com/NousResearch/hermes-agent/releases`) as the visual model.
- [ ] `## How to Apply` lists the four behaviour anchors so a future agent does not relitigate: do not introduce SemVer, do not introduce release branches, do not put release notes in a `CHANGELOG.md` file, do not gate the workflow on push or PR events.

### `vault/_index/learnings.md`

- [ ] An entry for `release-policy-and-flow.md` is added in the same format as existing learnings entries.

### `README.md` tweak

- [ ] Right after the H1 + tagline blockquote and before the `**Status:**` line, two shields.io badges sit on a single line:
  - `[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-brightgreen?style=flat-square)](./LICENSE)`
  - `[![Built By](https://img.shields.io/badge/BUILT%20BY-ribeirogab-blueviolet?style=flat-square)](https://github.com/ribeirogab)`
- [ ] The current `**Status:** early / experimental — …` single-line sentence is replaced by a GitHub Alert WARNING block:

  ```markdown
  > [!WARNING]
  > **Early / experimental.** Personal project, single-user, no SLA, no support guarantees. Breaking changes expected. Use at your own risk.
  ```
- [ ] All other README sections are unchanged. The eight-section structure shipped in PR #3 is preserved.

### Sanitization and language guards

- [ ] `grep -rnE '\b(você|porquê|nessa|também|então|usuário|configura)\b' GOVERNANCE.md vault/learnings/release-policy-and-flow.md README.md .github/workflows/release.yml` returns zero matches.
- [ ] `grep -nE 'Gabriel|gblosr' GOVERNANCE.md vault/learnings/release-policy-and-flow.md README.md` returns zero matches. (`ribeirogab` is allowed in the BUILT BY badge URL and in the `@ribeirogab` mention in `GOVERNANCE.md`'s Maintainership section, per the out-of-scope clauses of the sanitization rule.)

### First-release manual action (post-merge)

- [ ] **Operator action**: trigger the workflow once after merge with `gh workflow run release.yml -f prerelease=true` (or via the Actions UI). Verifiable: `gh release view v2026.5.4` returns the release object with `isPrerelease: true` and non-empty `body`.
- [ ] **Operator action**: confirm `https://github.com/ribeirogab/zeno-agent/releases` shows `v2026.5.4` with the orange Pre-release badge and an auto-generated changelog grouped by Conventional Commits type.

### PR hygiene

- [ ] PR is single-purpose: only governance + release flow + first release. No license/community/README rewrite work bleeds in (those tracks have shipped).
- [ ] PR description references this spec by path, lists the two manual operator actions as human-acceptance checkboxes, and quotes the workflow's `gh workflow run` invocation for convenience.
- [ ] Branch is `chore/oss-prep-smoke-test`. (Branch was originally created for Track G but Track G is parked and the operator approved reusing it for Track F. Branch can be renamed to `chore/oss-prep-governance` if preferred — operator decides during implementation.)

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `gh release --generate-notes` on the first release ever produces an enormous changelog (entire repo history). | After the workflow runs, the operator reviews the release notes and may edit them via `gh release edit v2026.5.4 --notes "..."` or via the GitHub UI. The workflow does not block the operator from a follow-up edit. |
| The release workflow fails because the default `GITHUB_TOKEN` permissions are restricted (`read-only`) at the repo level. | The workflow declares `permissions: contents: write` explicitly. If it fails, the operator must visit `Settings → Actions → General → Workflow permissions` and switch to "Read and write permissions". This is documented in `GOVERNANCE.md` as a setup note. |
| The operator forgets to trigger the workflow after merging the PR, leaving the repo without a first release. | The PR body lists the workflow trigger as a manual operator action checkbox. The PR is not closed until the first release is confirmed. |
| Future agent paraphrases the release rules in `GOVERNANCE.md` and accidentally introduces SemVer or backports. | The vault learning at `vault/learnings/release-policy-and-flow.md` documents the four anchored decisions explicitly with the rationale, so a future agent reading the constitution and the learning will not relitigate them. |
| The workflow's auto-derived CalVer relies on the runner's UTC date, which may differ from the operator's local date by up to a day. | Operator can override via the `version` input. The workflow's behaviour is documented in `GOVERNANCE.md`. |
| Adding `BUILT BY ribeirogab` to the README looks like a sanitization-rule violation to a future agent re-running the audit. | The sanitization rule's out-of-scope clause explicitly covers the canonical remote URL and git authorship — the same public attribution principle. The vault learning notes this rationale so a future audit does not flag it. |

## Open Questions

(None blocking. The eight brainstorm decisions Q1–Q8 — versioning model, pre-release flag policy, trunk-based dev, tag immutability, README highlight style, governance doc location, first-release timing, release-workflow style — are recorded in the Constraints and Acceptance Criteria sections above.)
