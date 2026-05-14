# Drop pnpm Host Prerequisite — Implementation Plan

> **For agentic workers:** Use the superpowers:executing-plans sub-skill to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax in [tasks.md](./tasks.md) for tracking. Spec lives at [spec.md](./spec.md).

**Goal:** Remove `pnpm` from the operator-side prerequisites of `install.sh` and `zeno upgrade` by bootstrapping it through `corepack`, leaving the final operator prereq set as `git + docker + node 24+`.

**Architecture:** A single new `upgradeSteps.bootstrapPnpm()` member in `apps/cli/src/lib/upgrade.ts` runs `corepack enable && corepack prepare pnpm@<version> --activate` with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` before each `pnpm install`. The matching POSIX-sh path inside `install.sh` parses the same `packageManager` field with `grep`/`sed` and runs the same two corepack commands. Both entry points read the canonical pnpm version from the cloned repo's `package.json` (no duplicate pin).

**Tech Stack:** TypeScript strict, Node 24 LTS, [corepack](https://nodejs.org/api/corepack.html) (built-in to Node 16.13+), pnpm 10.33.0 (pinned via `package.json#packageManager`), POSIX sh (`install.sh`), [vitest](https://vitest.dev/) (tests), [biome](https://biomejs.dev/) (lint+format).

---

## Phases

Phases are dependency-ordered: foundation first (the TS lib step), then surfaces that wire it in, then the shell-side analogue, then docs.

| Phase | Area | Tasks | Rationale |
|---|---|---|---|
| 1 | `upgradeSteps.bootstrapPnpm` (lib + unit tests) | 1 | Foundation. Every later phase either imports or mirrors it. |
| 2 | Wire `bootstrapPnpm` into `commands/upgrade.ts` (live + dry-run) | 2 | The CLI surface that calls the new step. Tests extend the existing `upgrade-pipeline.test.ts`. |
| 3 | `install.sh` corepack bootstrap | 1 | POSIX-sh side. Drops `need pnpm` and adds the corepack invocations. |
| 4 | Docs + ROADMAP + quality gate | 4 | Prereq lists, install.sh header comment, ROADMAP "Recently shipped" entry, full `pnpm run quality-gate`. |

**Total: 8 tasks.** Each task ends with a `git commit`. The full quality gate runs once at the end of Phase 4. The PR opens after Phase 4 with a green gate.

## File map

### Created

None — every change is an addition or edit to an existing file.

### Modified

| File | Change |
|---|---|
| `apps/cli/src/lib/upgrade.ts` | Add `parsePackageManagerVersion(home)` helper + `upgradeSteps.bootstrapPnpm()` member. |
| `apps/cli/tests/lib/upgrade.test.ts` | Add `describe('bootstrapPnpm', …)` block with three tests: happy path, missing `packageManager` field, non-zero corepack exit. |
| `apps/cli/src/commands/upgrade.ts` | Insert `bootstrapPnpm` call between `writeMeta` and `installDeps` in the live pipeline; add an "5. bootstrapPnpm (…)" line and renumber subsequent steps in the `--dry-run` printout (`installDeps` → 6, `buildCli` → 7, `buildImage` → 8). |
| `apps/cli/tests/commands/upgrade-pipeline.test.ts` | Extend the `--dry-run` test to assert `bootstrapPnpm` in the printed plan; extend the success-path test to assert call order includes the new step; add `bootstrapPnpm` to the hoisted `stepsMock` object so the `vi.mock` of `@/lib/upgrade.js` exposes it. |
| `install.sh` | Drop `need pnpm 'install pnpm 10: https://pnpm.io/installation'`. Add `parse_pnpm_version` helper, `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, and the two corepack commands immediately before `pnpm install --frozen-lockfile`. Update the file header comment (lines 14–28) to reflect the new prereqs. |
| `apps/cli/tests/commands/install-sh.test.ts` | Add two assertions: install.sh source contains `corepack enable` and does **not** contain a `need pnpm` line. |
| `apps/docs/content/docs/install.mdx` | Drop the `- pnpm 10` bullet from the Prerequisites list (line 16). |
| `ROADMAP.md` | Append a line to **Recently shipped** referencing issue #52 and the PR that lands this spec. |

### Deleted

None.

## Self-review notes

- **Spec coverage:** Phase 1 covers spec A3/A4/A5 (corepack bootstrap mechanics + missing-field error) at the lib layer; Phase 2 covers B1/B2/B3/B4/B5 (the eight-step pipeline + auto-revert hookup); Phase 3 covers A1/A2/A4/A5 (POSIX-sh side); Phase 4 covers C1/C3/C4 + D1/D2 (docs + quality gate). A6/B6 (CI smoke tests against `ubuntu:24.04`) and D3 (full install.sh end-to-end smoke) are runtime CI obligations of the existing `install-sh.test.ts` harness; no new test file is required because the existing harness already supports `ZENO_INSTALL_API_BASE` mocking — the new assertions in Task 7 cover the static side, and the pre-existing smoke run inherits the corepack bootstrap automatically once the script changes.
- **No placeholders.** Every code block below shows the literal content the engineer writes; no "see spec" or "fill in details".
- **Type consistency.** `bootstrapPnpm()` returns `void` consistently across `upgrade.ts`, the mock in `upgrade-pipeline.test.ts`, and the dry-run iteration order. The `parsePackageManagerVersion(home: string): string` signature is used identically by `bootstrapPnpm` and any caller introduced.
- **TDD ordering check.** Every code-changing task starts with a failing test, runs it to confirm failure, then writes the implementation, then runs again to confirm success.
