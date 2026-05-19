# CLI UX Overhaul — Implementation Plan

> **For agentic workers:** Use the superpowers:subagent-driven-development sub-skill to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax in `tasks.md` for tracking.

**Goal:** Land 39 CLI improvements (issue [#60](https://github.com/ribeirogab/zeno-agent/issues/60)) in a single PR — security/correctness fixes, `install.sh` and `zeno upgrade` flag parity, picker fallback for missing args, and general UX polish.

**Architecture:** Five foundation modules in `apps/cli/src/lib/` (`version-meta.ts`, `prompt.ts`, `errors.ts`, `resolvers.ts`, plus `output.ts` extensions) form the shared base. Every command surface (lifecycle, profile, connector, upgrade, new `status`) is refactored to consume them. `install.sh` is rewritten in POSIX sh with the same `.installed-from` line format. The `state.db` schema is unchanged.

**Tech Stack:** TypeScript strict, Node 24 LTS, pnpm 10, [citty](https://github.com/unjs/citty) (commands), [dockerode](https://github.com/apocas/dockerode) (Docker socket), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [vitest](https://vitest.dev/) (tests), [biome](https://biomejs.dev/) (lint+format). POSIX sh for `install.sh`.

---

## Phases

Phases are dependency-ordered: foundation first, then surfaces that import them.

| Phase | Area | Tasks | Rationale |
|---|---|---|---|
| 1 | Foundation modules | 5 | Every later phase imports from `version-meta.ts`, `prompt.ts`, `errors.ts`, `resolvers.ts`, or extended `output.ts`. |
| 2 | Security/correctness (A) | 4 | Smallest changes that already use the foundation; warm up the test pattern. |
| 3 | `install.sh` overhaul (B) | 6 | POSIX sh — independent surface, lands before TS refactors. |
| 4 | `zeno upgrade` overhaul (C) | 7 | Imports `version-meta` + `prompt`; biggest single-file refactor. |
| 5 | Picker fallback (D) | 10 | Refactors ~20 connector commands; depends on `resolvers.ts`. |
| 6 | UX polish (E) | 4 | Cross-cutting (`status`, destructive ops, friendly errors, `--json`/`--quiet`). |
| 7 | Docs + ROADMAP | 2 | Final pass; references the now-true behaviour. |

**Total: 38 tasks.** Each task ends with `git commit`. The full quality gate (`pnpm run quality-gate`) runs at the end of each phase. Final PR opens after Phase 7 with a green gate.

## File map

### Created

| File | Purpose |
|---|---|
| `apps/cli/src/lib/version-meta.ts` | `.installed-from` read/write + semver compare + display formatting (Q5) |
| `apps/cli/src/lib/prompt.ts` | `promptHidden` (raw-mode no-echo) + `confirm` + `confirmDestructive` (A1, E2) |
| `apps/cli/src/lib/errors.ts` | `friendly(ApiError)` mapping table + `runCommand(fn)` wrapper (E3) |
| `apps/cli/src/lib/resolvers.ts` | `resolveProfile`, `resolveConnector`, `resolveCatalog`, `resolveSecretKey`, `resolveTool`, `resolvePermission` (D, Q1) |
| `apps/cli/src/types/json-output.ts` | Per-command JSON response types (E4, Q4) |
| `apps/cli/src/commands/status.ts` | New top-level subcommand (E1, Q3) |
| `apps/cli/tests/lib/version-meta.test.ts` | Unit tests |
| `apps/cli/tests/lib/prompt.test.ts` | Unit tests |
| `apps/cli/tests/lib/errors.test.ts` | Unit tests |
| `apps/cli/tests/lib/resolvers.test.ts` | Unit tests |
| `apps/cli/tests/commands/status.test.ts` | Unit tests for `status` |
| `apps/cli/tests/commands/upgrade-pipeline.test.ts` | Pipeline order + auto-revert (A3, C7) |
| `apps/cli/tests/commands/install-sh.test.ts` | install.sh flag parser smoke (B6, B8) |

### Modified

| File | Change |
|---|---|
| `apps/cli/src/lib/upgrade.ts` | Drop `EDGE_TAG`/`EDGE`. Add `checkoutRef` (renamed from `checkoutTag`, supports tag/branch/pr/unstable). Add `setVersion`/`writeMeta` as members of `upgradeSteps`. `listReleases(limit)` accepts limit param. |
| `apps/cli/src/commands/upgrade.ts` | Use `compareSemver` for downgrade guard. Add `--branch`/`--pr`/`--dry-run`/`--yes`/`--limit`/`--notes`/`--unstable` flags (drop `--edge`). Mutex enforcement. Confirm prompts for unstable/branch/pr. Auto-revert pipeline. Picker `initialIndex` on latest stable + visual highlight of `unstable` row. |
| `apps/cli/src/commands/connector-install.ts` | `promptHidden`; resolvers; `runCommand`; `--quiet` |
| `apps/cli/src/commands/connector-secret-set.ts` | `promptHidden`; resolvers |
| `apps/cli/src/commands/connector-secret-rotate.ts` | `promptHidden`; resolvers |
| `apps/cli/src/commands/connector-secret-reveal.ts` | resolvers |
| `apps/cli/src/commands/connector-secret-list.ts` | resolvers; `--json` |
| `apps/cli/src/commands/connector-list.ts` | `resolveProfile` + post-pick hint; `--quiet` |
| `apps/cli/src/commands/connector-show.ts` | resolvers; `--json` |
| `apps/cli/src/commands/connector-test.ts` | resolvers |
| `apps/cli/src/commands/connector-enable.ts` | resolvers |
| `apps/cli/src/commands/connector-disable.ts` | resolvers |
| `apps/cli/src/commands/connector-uninstall.ts` | resolvers; `confirmDestructive` |
| `apps/cli/src/commands/connector-refresh-tools.ts` | resolvers |
| `apps/cli/src/commands/connector-catalog.ts` | resolvers; `--json` |
| `apps/cli/src/commands/connector-tool-list.ts` | resolvers; `--json` |
| `apps/cli/src/commands/connector-tool-set.ts` | resolvers; pickers for tool + permission |
| `apps/cli/src/commands/connector-tool-bulk.ts` | resolvers |
| `apps/cli/src/commands/connector-app-install.ts` | resolvers |
| `apps/cli/src/commands/connector-app-uninstall.ts` | resolvers; drop `--confirm "<name>"`; `confirmDestructive` |
| `apps/cli/src/commands/connector-app-installations-add.ts` | resolvers |
| `apps/cli/src/commands/connector-app-installations-discover.ts` | resolvers; `--json` |
| `apps/cli/src/commands/profile-use.ts` | Picker when no positional |
| `apps/cli/src/commands/profile-list.ts` | `--json`; `--quiet` |
| `apps/cli/src/commands/profile-show.ts` | `--json`; `--quiet` |
| `apps/cli/src/commands/profile-delete.ts` | Replace type-name confirm with `confirmDestructive` |
| `apps/cli/src/commands/start.ts` | Picker when no profile and no sticky |
| `apps/cli/src/commands/stop.ts` | Same |
| `apps/cli/src/commands/restart.ts` | Same |
| `apps/cli/src/commands/logs.ts` | Same |
| `apps/cli/src/commands/open.ts` | Same |
| `apps/cli/src/lib/output.ts` | `setQuiet(bool)` + quiet-aware `info`/`spin`/headers |
| `apps/cli/src/lib/version.ts` | Read `version-meta.ts` to display origin (`kind:value@sha`) |
| `apps/cli/src/index.ts` | Register `status` subcommand |
| `apps/api/src/routes/connectors.ts` | Drop `400 confirm_app_name_mismatch` enforcement |
| `apps/api/tests/routes/connectors-app-lifecycle.test.ts` | Drop `confirm`-name test |
| `infra/install.sh` | Full POSIX rewrite |
| `README.md` | Drop `--beta`, document new flags |
| `apps/docs/content/docs/cli.mdx` | Sections: `status`, `--json` schemas, `--quiet`, scripting guarantees; replace `--edge`/`--beta` with `--unstable`; add `--branch`/`--pr`/`--dry-run`/`--limit`/`--notes` |
| `apps/docs/content/docs/install.mdx` | Document install.sh flags |
| `ROADMAP.md` | Final commit before merge: move #60 from `Next` to `Recently shipped` |

### Deleted

None — all changes are edits or additions.

## Self-review notes

- Spec coverage: every Acceptance Criterion (A1–A4, B1–B9, C1–C12, D1–D10, E1–E4) maps to one or more tasks; the matrix lives at the bottom of `tasks.md`.
- No placeholder code: each step in `tasks.md` either contains the literal source change or a verifiable shell command with expected output.
- Type consistency: `VersionMeta`, `VersionKind`, `UpgradeStep`, `Hint` are referenced identically across all tasks.
- The `confirm_app_name_mismatch` API removal is paired with its test removal in the same task to keep the API surface coherent within the PR.
- Quality gate cadence: end of every phase (not every task) keeps signal/noise high without slowing tasks down.
