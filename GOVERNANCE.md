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
