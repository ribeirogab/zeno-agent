---
status: shipped
feature: zeno-cli
created: 2026-05-07
shipped: 2026-05-07
---
# Zeno CLI — Spec

**Status:** Draft
**Scope:** Replace daily `pnpm run docker:*` invocations with a single `zeno` binary that the operator can run from any working directory after a `curl | sh` install.

## Context

Today the operator runs `pnpm run docker:up`, `pnpm run docker:logs`, `pnpm run docker:sh`, and friends every day. The verbose form is cumbersome for tooling that runs constantly. The repo is single-user, self-hosted, and lives at a known clone path; that profile makes a curated CLI cheap to ship and high-leverage for the operator's daily ergonomics.

The CLI is also the natural surface to host commands that have no `docker compose` analogue (`doctor`, `open`, `status`) and to consolidate profile selection in one place. Issue #5 is the public-facing tracker; this spec is the implementation contract.

## Problem Statement

The operator's daily entry points (`pnpm run docker:up`/`down`/`logs`/`sh`) are verbose, require being inside the repo working directory, do not surface preflight diagnostics, and cannot be discovered through `--help`. There is no single canonical way to switch profiles, no shortcut to open the dashboard, and no thin escape hatch for raw `docker compose` access. The release workflow does not bump `package.json`, so any version-reporting surface (`zeno --version`) would have nothing reliable to read.

## Non-Goals

- **Onboarding / first-run profile setup.** Generating `ZENO_MASTER_KEY`, copying `.env.example` → `.env`, prompting for `DASHBOARD_PASSWORD`, running `claude setup-token`. Tracked in `vault/backlog.md` ("ONBOARDING flow"); will become its own issue after this spec ships.
- **Replacing the dashboard's OAuth flow.** Spec `vault/specs/2026-05-03-backend-auth-dashboard/spec-backend-auth-dashboard.md` already owns the migration of `pnpm run docker:setup-token` to a dashboard-spawned child process; that spec's task list also tracks removing the `package.json` script entry. The CLI ships zero token plumbing and does not surface a `setup-token` subcommand.
- **Multi-user support, hosted instance, cloud deploy.** Constitution scope guard.
- **Removing the existing `pnpm run docker:*` scripts** from `package.json`. They stay as a fallback / dev affordance; the CLI is the documented entry point.
- **Windows native installer.** Mac + Linux + WSL2 only. PowerShell flow is out of scope.
- **Rich terminal UI** (TUI, prompts, inks, etc.) for the CLI itself. Stdin/stdout passthrough only; the dashboard owns the rich UI surface.

## Constraints

- **Stack lock (`vault/constitution.md`):** TypeScript strict, Node 24, pnpm 10, biome, vitest. The CLI must use the same toolchain.
- **Single user, single clone.** The repo lives at `$ZENO_HOME` (default `~/zeno-agent`). No multi-instance concerns.
- **No sudo in the install path.** The `~/.local/bin` symlink avoids prompting for elevation. `curl | sh` plus `sudo` is rejected as antipattern.
- **No autonomous git writes** (constitution + global rule 20). The CLI may run `git pull` inside `zeno update`, but never `git push`.
- **Read-only database** (constitution). The CLI never writes to `app.db`. State lives in `apps/cli/.state.json`.
- **Shell:** `install.sh` must run on POSIX `sh` (no bash-isms — no arrays, no `[[ ]]`, no `${var,,}`, no process substitution). The script must execute identically under macOS `/bin/sh` (bash in POSIX mode), Linux `dash`, and `ash`/`busybox`.
- **Public repo.** No identifiers in the script or in spec examples.

## User Stories / Scenarios

1. **First install.** Operator on a fresh machine runs `curl -fsSL .../install.sh | sh`. The script verifies prerequisites, clones `~/zeno-agent`, builds the CLI, and writes the symlink. After the operator reloads their shell rc (or it was already on `PATH`), `zeno --help` works from any directory.
2. **Daily lifecycle.** Operator runs `zeno start`, edits a file, runs `zeno restart`, watches `zeno logs --service worker`, runs `zeno shell` to poke around, runs `zeno stop` at end of day.
3. **Health check.** Operator notices the agent is unresponsive, runs `zeno doctor`, and gets a checklist (docker running, `.env` present, profile resolves, compose file exists, dashboard reachable).
4. **Profile switch.** Operator runs `zeno profile list` (sees `default`, `fn`), runs `zeno profile use fn`, then `zeno start` boots the `fn` profile. `zeno profile show` confirms the resolved profile and its source.
5. **Update.** Operator runs `zeno update`. The CLI does `git pull --ff-only` inside `$ZENO_HOME`, runs `pnpm install --frozen-lockfile`, rebuilds the CLI bundle. The operator's symlink points at the new bundle automatically (same path).
6. **Escape hatch.** Operator wants `docker compose top` for the current profile. Runs `zeno docker top`. The CLI prepends `-f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME` and execs.
7. **Release.** Maintainer dispatches `Release` workflow on GitHub. The workflow resolves a CalVer tag (`v2026.5.7`), bumps root `package.json` to `2026.5.7`, commits `chore(release): v2026.5.7`, pushes the commit to `main`, tags it, creates the GitHub release. `zeno --version` next time the operator runs `zeno update` reflects the new version.

## Acceptance Criteria

### Install path

- [ ] Running `infra/install.sh` on a clean machine with `git`, `docker`, Node 24, and pnpm 10 installed exits 0 and creates `~/.local/bin/zeno` as a symlink to `~/zeno-agent/apps/cli/dist/index.js`.
- [ ] Running `infra/install.sh` with any one of {`git`, `docker`, `node`, `pnpm`} missing exits non-zero and prints the missing tool's name plus an install URL.
- [ ] Running `infra/install.sh` with Node version `< 24` exits non-zero and prints the actual version detected.
- [ ] Running `infra/install.sh` when `$ZENO_HOME` (default `~/zeno-agent`) exists as any directory — empty, partial clone, full clone, or unrelated content — exits non-zero with a single deterministic error message pointing at `zeno update` (if installed) or directory removal. The script does not inspect contents to decide between "valid clone" and "arbitrary directory" paths.
- [ ] `ZENO_HOME=/tmp/zeno-test infra/install.sh` clones into `/tmp/zeno-test` and the resulting `~/.local/bin/zeno` resolves there.
- [ ] After a successful install, `~/.local/bin/zeno` exists, is executable, and resolves (`readlink`) to `$ZENO_HOME/apps/cli/dist/index.js`.
- [ ] If `~/.local/bin` is not on `PATH` at install time, the script prints the export line for the operator's shell rc (zsh → `~/.zshrc`, bash → `~/.bashrc`).

### CLI surface

- [ ] `zeno --version` prints `zeno v<version>` where `<version>` is the value of `version` in `$ZENO_HOME/package.json`, with a leading `v` prepended.
- [ ] `zeno --help` lists every subcommand in the surface table (`start`, `stop`, `restart`, `status`, `shell`, `logs`, `build`, `doctor`, `open`, `update`, `profile`, `docker`).
- [ ] `zeno --help` exits 0; running with no arguments also prints help and exits 0.
- [ ] Each subcommand listed below propagates the underlying `docker compose` process exit code unchanged (verified by `docker compose` failing with non-zero → `zeno <cmd>` exits the same code).
- [ ] `zeno start` execs `docker compose -f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME up -d`.
- [ ] `zeno stop` execs `docker compose -f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME down`.
- [ ] `zeno restart` runs `zeno stop` first; if `stop` exits non-zero, `restart` exits with that code without running `start`. If `stop` exits 0, runs `zeno start` and propagates its exit code.
- [ ] `zeno status` execs `docker compose -f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME ps`.
- [ ] `zeno shell` execs `docker compose -f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME exec agent bash` with stdio inherited (interactive TTY).
- [ ] `zeno logs` execs `docker compose ... logs -f --tail 50` by default. `--tail N` substitutes the `50`. `--service <name>` (any named service from the resolved compose file, or `all`) appends `<name>` as a positional argument when not `all`; `all` (default) appends nothing.
- [ ] `zeno build` execs `docker compose -f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME build`. `--no-cache` appends `--no-cache` to the underlying call.
- [ ] `zeno doctor` runs all of these checks and prints a per-check status table: (a) docker daemon reachable, (b) `$ZENO_HOME` exists, (c) resolved profile's compose file exists, (d) resolved profile's `.env` file exists, (e) container for the resolved profile is running (via `docker compose ps`), (f) dashboard port `3000` reachable — but only if (e) passed; if the container is not running, (f) is reported as "skipped (agent not running)" and does not count as a failure. Exits 0 only if all non-skipped checks pass; exits non-zero otherwise.
- [ ] `zeno open` opens `http://localhost:3000` in the OS default browser (`open` on mac, `xdg-open` on linux, `wslview` on WSL).
- [ ] `zeno update` runs `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm build --filter @zeno/cli` inside `$ZENO_HOME`, in that order, aborting on first failure.
- [ ] `zeno docker <args...>` execs `docker compose -f infra/docker-compose.<profile>.yml --project-directory $ZENO_HOME <args>`.

### Profile resolution

- [ ] `zeno profile show` prints `profile: <name> (source: flag|env|state|default)` reflecting the resolution chain (flag > `ZENO_PROFILE` > `apps/cli/.state.json` > `default`).
- [ ] `zeno profile use <name>` validates that `infra/docker-compose.<name>.yml` exists; if so, writes `{"profile": "<name>"}` to `apps/cli/.state.json` and exits 0; if not, exits non-zero and lists valid profiles.
- [ ] `zeno profile list` prints the names parsed from `infra/docker-compose.*.yml` filenames in `$ZENO_HOME`, prefixing the resolved current with `*`.
- [ ] Passing `--profile <name>` on any subcommand uses that profile for that invocation only and does not modify `apps/cli/.state.json`.
- [ ] If the resolved profile's `infra/docker-compose.<name>.yml` does not exist, every command except `profile list`, `profile use`, `--help`, `--version`, and `doctor` exits non-zero with a clear error pointing at `zeno profile list`.

### Release workflow

- [ ] `.github/workflows/release.yml` performs these steps in this exact order, each as its own job step: (1) Checkout with `fetch-depth: 0`, (2) Resolve tag and title (existing logic, unchanged), (3) Setup Node via `actions/setup-node@v4` with `node-version: 24`, (4) Setup pnpm via `pnpm/action-setup@v4` with `version: 10`, (5) Bump root `package.json` via `pnpm version "${TAG#v}" --no-git-tag-version` — `pnpm version` is the sole mechanism, no `node -e` fallback, (6) `git add package.json && git commit -m "chore(release): $TAG"`, (7) `git push origin HEAD:main`, (8) `git tag "$TAG" && git push origin "$TAG"`, (9) Create GitHub Release (existing logic).
- [ ] After a release run, `git checkout <tag>` and reading `package.json` shows the version equal to the tag with the leading `v` stripped (e.g. tag `v2026.5.7` → `package.json` `version: "2026.5.7"`).
- [ ] The workflow's `permissions:` block includes `contents: write` (already present, must not regress).
- [ ] The bump step does not modify any `package.json` other than the repo root (verified: `pnpm version <ver> --no-git-tag-version` without `--recursive` only touches the cwd's `package.json`).

### Repo hygiene

- [ ] `.gitignore` adds `apps/cli/dist` and `apps/cli/.state.json`.
- [ ] `README.md` Quickstart documents the `curl | sh` one-liner and the `zeno` daily commands; the old `pnpm run docker:*` block is replaced.
- [ ] `AGENTS.md` commands table lists the `zeno` surface as the primary entry point; `pnpm run quality-gate` remains.
- [ ] No identifier sanitization rule violations (`vault/rules/sanitization`) introduced in any new file.
- [ ] `pnpm run quality-gate` passes after the change.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `git push origin HEAD:main` from the release workflow is blocked by branch protection rules. | Verify branch protection settings (`gh api repos/ribeirogab/zeno-agent/branches/main/protection`) before merging the workflow change. If GH Actions bot is blocked, either grant the `github-actions[bot]` an exception or switch to a deploy-key / app-token push. Document the chosen path in a learning. |
| `pnpm version` on a `private: true` root refuses or behaves unexpectedly. | `pnpm version --no-git-tag-version` is documented to work on private packages — it skips the publish step but still mutates `package.json`. Verified locally against `pnpm@10.33.0` (the project's pinned version) before merging the workflow change. If the verification fails, halt — do not silently switch mechanisms; reopen this spec to reconsider. |
| `~/.local/bin` is not on `PATH` for some operator shells (older fish, custom rcs), so the symlink works but `zeno` is not callable. | The install script detects `PATH` membership and prints an explicit `export PATH=...` snippet for the detected shell rc. The operator action is one paste. |
| `curl \| sh` is intrinsically a trust transfer. The script lives at a public URL and the source is in the repo. | The README links to the source file (`infra/install.sh`) so operators can audit before piping. The script is signed by being committed; tampering would require a force-push to `main`. |
| `git pull --ff-only` inside `zeno update` fails when the operator has uncommitted local changes in `$ZENO_HOME`. | Bail with a clear error pointing the operator at `git status` and let them decide. Never `git stash` or discard changes silently. |
| Operator clones the repo a second time outside `~/zeno-agent` for development; `apps/cli/.state.json` in the dev clone diverges from the installed clone. | The CLI binary is symlinked from the installed clone only; running it always reads state from `$ZENO_HOME/apps/cli/.state.json`. The dev clone's state file is never consulted by the installed `zeno`. |
| `tsup` bundle externalizes `node_modules`, but the symlinked `dist/index.js` cannot resolve them when invoked from arbitrary cwd. | The bundle uses `import.meta.url` to locate its own directory and Node's resolution finds `$ZENO_HOME/node_modules` via the standard upward walk. Verified by running `zeno --version` from `/` after install. |
| CalVer collisions across same-day releases (already mitigated by existing auto-suffix logic). | Existing workflow logic already handles `v2026.5.7.1`, etc.; the bump step uses `${TAG#v}` which preserves suffixes. |

## Open Questions

None. All design decisions are locked through the brainstorming dialogue.
