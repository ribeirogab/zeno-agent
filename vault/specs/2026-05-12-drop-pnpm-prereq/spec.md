---
status: draft
feature: drop-pnpm-prereq
created: 2026-05-12
shipped: null
---
# Drop pnpm Host Prerequisite — Spec

**Status:** Draft
**Scope:** Single PR, single feature branch (`feat/drop-pnpm-prereq`). Remove `pnpm` from the operator-side prerequisites of `install.sh` and `zeno upgrade` by bootstrapping pnpm through `corepack` ahead of every `pnpm install` / `pnpm build` invocation. Final operator prereqs: `git`, `docker`, `node 24+`.

Resolves issue [#52](https://github.com/ribeirogab/zeno-agent/issues/52). The issue's original framing (drop both Node and pnpm via Bun-compiled binaries) was reconsidered during brainstorming: the actual friction every new operator hits is `pnpm`, not `node`. Most operators already run Node for unrelated work; pnpm is the one tool they install solely to run Zeno. Corepack — already used inside `infra/Dockerfile:26` — gives the same operator-visible win with a fraction of the surface area, no CI matrix, no asset hosting, and no native-binding portability risk.

## Brainstorm Q&A

Decisions below are locked unless re-opened in writing.

### Q1 — Mechanism: corepack vs npm vs Bun-compile binary

**Decision: corepack.** `install.sh` and `zeno upgrade` run `corepack enable && corepack prepare pnpm@<version> --activate` before any `pnpm install` / `pnpm build`. The `<version>` is parsed from the `packageManager` field of the cloned repo's `package.json`.

**Reasons:**

- **npm** understands `workspace:*` since 8.3 but does not consume `pnpm-lock.yaml`, so installs become non-deterministic; pnpm-only `package.json` config (`pnpm.onlyBuiltDependencies` — the allowlist that gates native build scripts for `better-sqlite3` and `node-pty`) is silently ignored. Shipping a parallel `package-lock.json` invites drift between lockfiles.
- **Bun-compile binary** delivers the strongest operator UX (no Node either) but adds: a four-target CI matrix, GitHub release asset hosting + SHA-256 verification, atomic binary replace logic, native-binding portability risk for `better-sqlite3` + `node-pty` + `dockerode`, and a fallback path that still exists for `--unstable`/`--branch`/`--pr`. The cost/value ratio is poor when the unique friction the operator actually hits is pnpm.
- **corepack** is built into Node 16.13+ (so Node 24 always has it), reads `packageManager` natively, honors `pnpm-lock.yaml`, respects `pnpm.onlyBuiltDependencies`, and is already the mechanism `infra/Dockerfile` uses internally. Zero new infrastructure.

**Trade-off accepted:** operator prereq is reduced from `git + docker + node + pnpm` to `git + docker + node`, not to `git + docker`. Bun-compile binary remains a viable future spec if Node-free install becomes the highest-leverage onboarding improvement.

### Q2 — Parsing `packageManager` version in POSIX sh

**Decision:** grep + sed, no `jq`. Helper inside `install.sh`:

```sh
parse_pnpm_version() {
  grep '"packageManager"' "$ZENO_HOME/package.json" \
    | sed 's/.*"pnpm@\([^"]*\)".*/\1/'
}
```

**Reasons:** `install.sh` already forbids `jq` (header comment line 28). The `packageManager` field has a single, narrow shape (`"pnpm@<semver>"`); `grep` + `sed` parses it deterministically. Mirrors the pre-existing `parse_tag` pattern in `install.sh:111`.

**Trade-off accepted:** fragile to format changes in `package.json` (e.g. a future pnpm release that adds a checksum suffix `pnpm@10.33.0+sha512.abc...`). Mitigation: the helper extracts up to the closing `"`, so a `+sha512...` suffix is captured intact and corepack accepts it. If pnpm changes the format in a more disruptive way, the helper's failure mode is loud — `corepack prepare pnpm@ --activate` exits non-zero immediately.

### Q3 — Where the bootstrap lives in `upgradeSteps`

**Decision:** new named member `bootstrapPnpm()` inside `upgradeSteps` in `apps/cli/src/lib/upgrade.ts`, positioned between `writeMeta` and `installDeps`. The pipeline grows from seven to eight steps:

```
1. fetchTags()
2. checkoutRef(target, kind)
3. setVersion(display)
4. writeMeta(meta)
5. bootstrapPnpm()         ← NEW
6. installDeps()
7. buildCli()
8. buildImage()
```

**Reasons:** consistency with the spec `2026-05-09-cli-ux-overhaul` Q5 contract that `upgradeSteps` is the single source of truth for the seven-now-eight pipeline. `--dry-run` (cli-ux-overhaul C7) enumerates step names by iterating the object, so adding a member is sufficient — no separate plumbing. The auto-revert handler (cli-ux-overhaul A3) catches failures of any post-`writeMeta` step uniformly, including `bootstrapPnpm`.

**Trade-off accepted:** `bootstrapPnpm` must run on every upgrade, including upgrades between two releases whose pinned pnpm version is identical. The wasted work is bounded — `corepack prepare` is idempotent and cached under `~/.cache/node/corepack`, so the second invocation is fast.

### Q4 — Surfacing the `COREPACK_ENABLE_DOWNLOAD_PROMPT` env

**Decision:** export `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in both `install.sh` (process env, exported once before the corepack calls) and in the `spawnSync` env passed by `bootstrapPnpm` in `upgradeSteps`.

**Reasons:** Node 20+ corepack performs a signature verification step that prompts the user when the pinned pnpm version is not pre-cached. The prompt is interactive — in a `curl … | sh` pipeline (no TTY for stdin) or in `zeno upgrade --yes` (CI-driven non-TTY), an interactive prompt would either hang or abort. Setting the env to `0` skips the prompt and assumes consent, which is appropriate because the pinned version comes from the repo's own `package.json` (which the operator already trusts to run).

**Trade-off accepted:** if a future Node release renames or removes the env, corepack reverts to interactive prompts. Mitigation: `install.sh` smoke test exercises the non-TTY path; regression will surface immediately.

### Q5 — Behavior when `package.json` lacks a `packageManager` field

**Decision:** both `install.sh` and `bootstrapPnpm()` fail loudly with the same message:

```
error: package.json missing "packageManager" field (corepack bootstrap requires it)
```

`bootstrapPnpm()` throws before invoking corepack; `install.sh` exits 1.

**Reasons:** Constitution rule 12 — fail noisily and as soon as possible. A missing `packageManager` field would otherwise cascade into a confusing `pnpm: command not found` later in the pipeline. The field is a one-line repo invariant; a missing field signals a broken checkout, not a supported configuration to silently work around.

**Trade-off accepted:** any contributor who removes the `packageManager` field by accident breaks every operator install / upgrade from that release forward. Mitigation: the field already exists at `package.json:11` and is essential to `infra/Dockerfile`; removal is unlikely without a deliberate refactor.

### Q6 — Migration story for operators on pre-spec releases

**Decision:** no migration code. Operators on `v2026.5.12` or earlier still run an `install.sh` that requires `pnpm` on the host; their next `zeno upgrade` to the spec-shipping release uses the **existing** (current code's) source-build path, which still needs pnpm. After that upgrade, all subsequent upgrades use the corepack-bootstrapped path.

**Reasons:** any code that detects "running on pre-corepack release" would have to ship in the **previous** release, which has already shipped. Adding bridge logic in the current release benefits no one (operators on the new release no longer need it; operators on the old release cannot run the new release's code yet). Release notes call out the one-time prereq drop explicitly.

**Trade-off accepted:** the first hop into the spec-shipping release still requires the old toolchain. Acceptable: the operator already has the toolchain (it was a prereq to install at all).

### Q7 — Does CI also drop pnpm via corepack?

**Decision:** no. The release workflow at `.github/workflows/release.yml` keeps `pnpm/action-setup@v4`. Spec touches only operator-side entry points.

**Reasons:** CI's tradeoff is the opposite of the operator's — pinning a pnpm action version is faster, more cacheable, and more auditable than a `corepack prepare` on every run. Migrating CI is non-trivial (every workflow that runs lint/typecheck/test does its own `pnpm/action-setup@v4` invocation) and provides no operator-facing value.

**Trade-off accepted:** two pnpm-bootstrap mechanisms coexist in the repo (corepack for operators, action for CI). Documented in this spec; visible drift if pnpm's pinned version changes (the `packageManager` field is the single source of truth for both, so drift is impossible by construction).

## Context

The `install.sh` script at lines 218–219 runs `pnpm install --frozen-lockfile && pnpm build --filter @zeno/cli` after cloning the repo. Operators must install pnpm 10 ahead of time. The same prerequisite is enforced via `need pnpm` at line 179. `zeno upgrade` repeats this work — `upgradeSteps.installDeps` and `upgradeSteps.buildCli` in `apps/cli/src/lib/upgrade.ts:159-164` shell out to `pnpm` directly.

Inside the runtime image, the project already solved this problem differently: `infra/Dockerfile:26` runs `corepack enable && corepack prepare pnpm@10.33.0 --activate`. The Docker build never requires the operator to install pnpm on the image base. The same approach can be lifted into the operator's host environment.

This spec is the second narrowing of issue #52. The original issue proposed Bun-compiled binaries to drop both Node and pnpm from operator prereqs. During brainstorming, the cost (CI matrix, asset hosting, native-binding portability, parallel source-build fallback for `--unstable`/`--branch`/`--pr`) was judged too high relative to the operator-side win (most operators already have Node installed; pnpm is the truly unfamiliar dependency). The narrower scope ships the operator-visible improvement that motivated the issue.

## Problem Statement

Three operator-facing flows currently require pnpm on the host:

1. `install.sh` first-time install (lines 179, 218–219).
2. `zeno upgrade` for any target — tag, branch, PR, or `--unstable` (`apps/cli/src/lib/upgrade.ts:159, 162`).
3. `zeno doctor` (no current check, but expected to flag missing prereqs).

Every operator hits flow 1 exactly once; flows 2 and 3 recur. Three different code paths reproduce the same prerequisite assumption. Adopting corepack eliminates the assumption from all three at once because corepack reads `packageManager` from the cloned repo's `package.json`, which already pins the canonical version.

## Non-Goals

- **Dropping Node from the prereqs** — out. Bun-compile binary path remains a future-spec option; rejected here because Node is already present on most operator hosts and pnpm is the actual unique friction.
- **Migrating CI off `pnpm/action-setup@v4`** — out (Q7). CI's tradeoffs differ.
- **Migrating the dev workflow off direct `pnpm` invocations** — out. Contributors continue running `pnpm install` / `pnpm run quality-gate` directly. `CONTRIBUTING.md:16,33` stays as-is.
- **Pre-populating the corepack cache inside the Docker image** — out. The cache is operator-host-side; Docker image lifecycle is unaffected.
- **Detecting and reusing an existing host pnpm** — out. `corepack prepare --activate` is fast, deterministic, and idempotent; "use whatever pnpm the operator has installed" reintroduces version drift.
- **Adding a `zeno doctor` check for corepack** — out. Node 24 always ships corepack; a check would be theatre.
- **Backwards-compat shims for operators on pre-spec releases** — out (Q6).
- **Removing `pnpm/action-setup@v4` from `.github/workflows/release.yml` or any other workflow** — out (Q7).
- **Updating the `infra/Dockerfile` corepack invocation** — out. Already correct; this spec aligns operator-side with the existing image-side pattern, not the other way around.

## Constraints

- **POSIX sh** in `install.sh`. No bash arrays, `[[ ]]`, process substitution, `jq`, or `gh` dependency.
- **No new top-level CLI dependencies** in `apps/cli`. `bootstrapPnpm` uses `node:child_process.spawnSync` and `node:fs` only.
- **Single source of truth for the pnpm version** — `package.json`'s `packageManager` field. No second declaration in `install.sh`, `upgrade.ts`, or any workflow file.
- **Quality gate** (`pnpm run quality-gate` — lint + typecheck + tests across all workspaces) must pass before merge.
- **Vault docs in English** (project rule). Spec body, comments, and error messages: English.
- **No real identifiers** in committed content (Constitution + sanitization rule).
- **Single PR, single branch (`feat/drop-pnpm-prereq`)**. No flag-gated phased rollout.

## User Stories / Scenarios

1. **Fresh operator, macOS or Linux, with `git` + `docker` + `node 24` installed and no `pnpm` on `PATH`** runs `curl -fsSL https://zeno-agent.dev/install.sh | sh` → installer reports `cloning…`, then `bootstrapping pnpm via corepack…`, then `installing dependencies…`, then `building CLI…`, then `Installed CLI to ~/.local/bin/zeno`. Operator runs `zeno --help` and sees the subcommand list.
2. **Fresh operator without `node`** runs `curl … | sh` → installer fails fast at the existing `need node` check with the existing message (`node not found. install Node.js 24 LTS: …`). No regression.
3. **Operator on `v2026.5.13` (spec-shipping release)** with no host `pnpm` runs `zeno upgrade --to v2026.5.14` → spinner sequence shows the eight pipeline steps; `bootstrapPnpm` succeeds idempotently; upgrade completes.
4. **Operator running `zeno upgrade --dry-run --to v2026.5.14`** sees eight steps in the printed plan, with step 5 listed as `bootstrapPnpm (corepack prepare pnpm@<version> --activate)`. Exit 0 without invoking corepack.
5. **AI agent in CI** runs `curl … | sh -s -- --version v2026.5.14` against a stock `ubuntu:24.04` image with only `git`, `docker`, `node` installed → install completes without interactive prompt; `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` suppresses the signature-verification prompt that would otherwise hang.
6. **Operator on an old release** (before this spec ships) runs `zeno upgrade` to the spec-shipping release → existing pre-corepack path still works because the operator has `pnpm` from the previous prereq. After that upgrade, future upgrades use corepack.
7. **Contributor cloning the repo locally for development** runs `pnpm install` directly using their host pnpm. Unaffected — the corepack bootstrap is operator-side only.
8. **Operator on a host where `package.json` was somehow tampered with and `packageManager` is missing** runs `zeno upgrade` → CLI fails fast with `error: package.json missing "packageManager" field (corepack bootstrap requires it)` and exits 1 before touching the build pipeline.

## Acceptance Criteria

### A — Operator install path

- [ ] **A1** Fresh `curl -fsSL https://zeno-agent.dev/install.sh | sh` against a host with `git`, `docker`, `node 24+`, and `curl` installed and **no `pnpm` on `PATH`** completes with exit code 0 and produces a working `~/.local/bin/zeno` symlink. Verified by a CI smoke test that runs the installer inside a `ubuntu:24.04` container with `pnpm` explicitly absent from `PATH`.
- [ ] **A2** `install.sh` source no longer contains the line `need pnpm 'install pnpm 10: https://pnpm.io/installation'` or any other `need pnpm …` invocation.
- [ ] **A3** `install.sh` invokes `corepack enable` and `corepack prepare pnpm@<version> --activate` (in that order) immediately before the first `pnpm install`, where `<version>` is parsed from the cloned repo's `package.json` `packageManager` field via a `parse_pnpm_version` helper.
- [ ] **A4** `install.sh` exports `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` before the corepack invocations; verified by a unit test of the script (run with `--dry-parse` plus a stubbed corepack) that asserts the env is present when corepack is called.
- [ ] **A5** When the cloned repo's `package.json` lacks a `packageManager` field, `install.sh` prints `error: package.json missing "packageManager" field (corepack bootstrap requires it)` to stderr and exits 1 without invoking corepack.

### B — `zeno upgrade` parity

- [ ] **B1** `apps/cli/src/lib/upgrade.ts` exports `upgradeSteps.bootstrapPnpm(): void`. The function reads `<ZENO_HOME>/package.json`, extracts the `packageManager` field, splits on `@`, and invokes `corepack enable` then `corepack prepare pnpm@<version> --activate` via `spawnSync` with `env: { …process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' }` and `stdio: 'inherit'`. Non-zero exit of either subcommand throws `Error('bootstrapPnpm failed: …')`.
- [ ] **B2** `apps/cli/src/commands/upgrade.ts` runs `bootstrapPnpm` after `writeMeta` and before `installDeps` in the live pipeline; verified by an integration test that stubs `upgradeSteps` and asserts the call order.
- [ ] **B3** `zeno upgrade --dry-run` prints eight pipeline steps, with step 5 reading `5. bootstrapPnpm (corepack prepare pnpm@<version> --activate)`. The string `<version>` resolves to the value parsed from `package.json` at command time.
- [ ] **B4** A failing `bootstrapPnpm` step triggers the auto-revert handler (from spec `2026-05-09-cli-ux-overhaul` A3): the CLI prints `✗ bootstrapPnpm failed: …` followed by `✓ reverted to <prev_display>`, runs `git checkout <prev_value>`, restores `setVersion`/`writeMeta`, and exits 1. Verified by injecting a corepack failure in a unit test.
- [ ] **B5** When `package.json` lacks a `packageManager` field, `bootstrapPnpm` throws `Error('package.json missing "packageManager" field (corepack bootstrap requires it)')` before invoking corepack. The auto-revert handler then surfaces the same message and reverts.
- [ ] **B6** `zeno upgrade` against a freshly-cloned host (e.g. inside a `ubuntu:24.04` container with `git`, `docker`, `node 24+`, and no `pnpm`) completes when called with `--to <tag>` against any valid release tag. Verified by a CI integration test.

### C — Documentation

- [ ] **C1** `apps/docs/content/docs/install.mdx` prerequisites section lists `git`, `docker`, and `Node.js 24 LTS` only. The lines `- pnpm 10` and any reference to installing pnpm are removed from the **Prerequisites** section.
- [ ] **C2** `README.md` no longer references pnpm as an operator-side prerequisite. References to `pnpm run quality-gate` in contributor-facing sections remain.
- [ ] **C3** `install.sh` header comment (lines 14–28) is updated to reflect the new flow — drops the "pnpm 10+" mention from the prerequisites list and adds a one-line note that corepack bootstraps pnpm from `package.json`.
- [ ] **C4** `ROADMAP.md` moves issue #52 from open to "Recently shipped" (or the equivalent section) referencing this spec by slug.

### D — Quality gate

- [ ] **D1** `pnpm run quality-gate` is green on the feature branch (lint, typecheck, tests across all workspaces).
- [ ] **D2** New tests live at `apps/cli/tests/lib/upgrade.test.ts` (for `bootstrapPnpm`) and `apps/cli/tests/commands/upgrade.test.ts` (for the eight-step pipeline order and dry-run output). No existing test in `apps/cli/tests/` regresses.
- [ ] **D3** A shell smoke test runs `install.sh` end-to-end in a `ubuntu:24.04` container without pnpm preinstalled, with the GitHub REST endpoint mocked via `ZENO_INSTALL_API_BASE`. The smoke test lives under `apps/cli/tests/install-sh/` or an equivalent location consistent with the existing `install.sh --dry-parse` test pattern.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Corepack signature-verification prompt blocks non-TTY install or upgrade | Export `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in both entry points; CI smoke test exercises the non-TTY path and asserts non-interactive completion. |
| Future pnpm release changes the `packageManager` field format (e.g. adds a `+sha512` checksum) and breaks `parse_pnpm_version` | The grep/sed extractor captures up to the closing `"`, so suffixed forms are passed to corepack intact. If pnpm changes the format more disruptively, `corepack prepare` fails loudly with a non-zero exit — caught by the auto-revert handler (B4) or the installer's `set -eu` (A5 message variant). |
| `bootstrapPnpm` runs on every upgrade and adds latency even when the pinned pnpm version is already activated | `corepack prepare` is idempotent and uses `~/.cache/node/corepack`; second-onwards invocations are sub-second. Documented in `upgrade.ts` JSDoc on the `bootstrapPnpm` member. |
| Contributor accidentally removes the `packageManager` field during a refactor | A5/B5 fail loudly; the message names the field. The `infra/Dockerfile:26` build also breaks immediately, so the regression cannot slip past CI. |
| Operator runs an old (pre-spec) `install.sh` that still requires pnpm and is confused by the new docs claiming pnpm is no longer needed | Docs and release notes explicitly state that the install URL must point to the spec-shipping release or later. The `install.sh` wrapper at `zeno-agent.dev/install.sh` already forwards to the latest stable release tag's installer, so curl-piped installs automatically pick up the new code after this release ships. |
| Operator's host has a Node release < 16.13 with no corepack binary | The existing `need node` check + the existing Node 24 version assertion in `install.sh:182-185` already prevent this. No additional check needed. |
| `corepack enable` requires write access to `node`'s `bin` directory; operators using a system Node install may fail | `corepack enable --install-directory <writable>` exists. If users report this, follow up with `--install-directory $HOME/.local/bin` — but most operators use `fnm`/`nvm`-managed Node where the bin directory is writable. Documented as a known limitation in `apps/docs/content/docs/install.mdx` only if a real report surfaces. |
| The smoke test's mocked GitHub REST endpoint drifts from the real API shape | The mocking pattern is already used by spec `2026-05-09-cli-ux-overhaul` B5; reuse the existing harness rather than introducing a second. |

## Open Questions

None at spec time. All design decisions are locked in the Q&A above.
