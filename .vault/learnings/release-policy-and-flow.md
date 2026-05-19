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
