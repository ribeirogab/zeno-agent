---
status: draft
feature: multi-profile-cli
created: 2026-05-07
shipped: null
---
# Multi-Profile CLI — Spec

**Status:** Draft
**Scope:** Replace per-profile docker-compose orchestration with CLI-driven multi-profile lifecycle management backed by a host-side SQLite state DB; kill `config.yaml` entirely.

## Context

The previous CLI ([[../2026-05-07-zeno-cli/spec|zeno-cli]]) added a `zeno` binary that wraps `docker compose` with one compose file per profile (`infra/docker-compose.<name>.yml`). That works for a single profile but turns into manual yaml duplication once an operator wants more than one (`personal`, `work`, side projects). It also leaves first-class profile concerns — port allocation, owner identity, lifecycle status — split between filesystem (compose files), the host's local convention (where to clone), and per-profile `.env` files.

This spec introduces a **CLI-only orchestration model**: the CLI talks directly to the Docker Engine API on the host and uses a SQLite state database (`~/.zeno/state.db`) as the source of truth for profile metadata. Compose files for profiles disappear entirely; one container per profile is created/started/stopped via `dockerode`.

The same spec also kills `config.yaml`, a profile-level YAML file that today carries a `git_identity:` section consumed by `apps/worker` and `infra/entrypoint.sh`. The git identity already has a working fallback (`gh api /user`) since the GitHub App connector landed; the YAML path is dead weight. A `cron:` section was the other consumer, used by `apps/worker/src/cron/static-loader.ts` to seed cron jobs from yaml — that is dropped without replacement (operator can re-add static crons via DB seed if needed; deferred).

This is a **breaking change** for the only existing operator (the maintainer). Profiles, volumes, and compose files from the prior model are not migrated; they are deleted manually before re-creating profiles via the new CLI. Documented in pre-release notes.

## Problem Statement

The operator needs to manage **N profiles** on a single laptop (personal, work, side-project) with isolated containers, dashboards, and credentials. The current model requires hand-editing `infra/docker-compose.<name>.yml` per profile, picking ports manually, copying `.env` and `USER.md` from examples, and managing each profile's lifecycle through a different compose project. There is no CLI surface for **creating** a profile (only switching between pre-existing ones via `zeno profile use`), no surface for editing port assignment, no inventory view of running containers across profiles, and no source of truth that survives `rm -rf` on the cloned repo.

`config.yaml` adds a third configuration plane (alongside `.env` and `USER.md`) for a feature (static crons) the operator never used and a feature (git identity) that has a working fallback. It costs an entrypoint shell parser, a yaml dependency in the worker, a watcher branch in `apps/worker/src/profile/watcher.ts`, and a config example file the operator must remember to edit during install.

## Non-Goals

The following are explicitly **out of scope** and must not creep in:

- **Multi-user support.** Constitution-locked. Single operator, single login, no allowlists.
- **Hosted/SaaS instance.** Constitution-locked. Local-only.
- **Windows native installer.** Mac/Linux/WSL2 only.
- **Production-grade auth on profile dashboards** (signed tokens, sessions, 2FA). Today: bind 127.0.0.1 + CSRF token + `SameSite=Strict`. Future spec, tracked in `.vault/backlog.md`.
- **Onboarding wizard inside the profile dashboard** (Connect Claude, Slack, connectors). Existing dashboard flow continues; visual onboarding ships in a follow-up spec.
- **Backup / restore tooling** (`zeno backup`, `zeno restore`). Operator uses `tar`/`docker volume export` manually; tooling is backlog.
- **Doctor auto-fix / reconciliation** of DB ↔ Docker drift. `zeno doctor` reports drift, does not heal. Auto-heal is backlog.
- **Migration of `@zeno/storage` to drizzle.** Runtime DB stays raw `better-sqlite3`. Backlog: `unify-db-as-drizzle`.
- **Audit log retention or rotation.** Append-only, unbounded growth acceptable for single-user volume.
- **Migration tooling for profiles created under the previous model.** Hard cut; operator wipes and recreates.
- **Compose escape hatch in CLI** (`zeno docker <args>`). Operator shells out to `docker` directly if needed.
- **`status`, `shell`, `build` commands.** Inventory replaced by `profile list`; container shell replaced by `docker exec` direct; build embedded in `start`.
- **Editor opening (`zeno edit <profile>`)**. Operator runs their own editor against `~/.zeno/profiles/<name>/USER.md`.
- **Audit log read command (`zeno audit`)**. Operator queries the SQLite DB directly if needed.
- **Refactor of `apps/worker`, `apps/api`, `apps/dashboard`** beyond the surgical removal of `config.yaml` consumers.

## Constraints

- **Stack lock** (`.vault/constitution.md`): TypeScript strict, Node 24 LTS, pnpm 10, biome, vitest. CLI continues to use `citty` and `tsup`. New runtime deps: `better-sqlite3`, `drizzle-orm`, `dockerode`. New devDeps: `drizzle-kit`, `@types/better-sqlite3`, `@types/dockerode`.
- **Single user, single clone.** Repo lives at `~/.zeno/zeno-agent/` exactly (hardcoded). No `ZENO_HOME` override. Rationale: minimize alternative paths, simplify mental model.
- **No autonomous git writes** (constitution + global rule 20). `zeno upgrade` performs `git fetch` / `git checkout` / `git pull --ff-only` but never `git push`.
- **Read-only database constraint** does not apply — `state.db` is owned by the CLI and is the source of truth for profile orchestration.
- **No real identifiers in committed content** (`.vault/rules/sanitization`). Examples in this spec use `personal`, `work`, `acme` — never the maintainer's actual profile names.
- **POSIX `sh` for `infra/install.sh`** (no bash-isms). Must run identically under macOS `/bin/sh`, Linux `dash`, `ash`, BusyBox.
- **Public repo.** No tokens, no personal email/handles in committed examples.
- **Drizzle-only for new DB.** `state.db` schema and queries live behind `@zeno/db/host` (a new package with one subpath). Runtime DB (`zeno.db`, per-profile) keeps its current `@zeno/storage` raw `better-sqlite3` until the deferred unification spec lands. Two SQL conventions coexist temporarily; documented in backlog.
- **Container image is shared.** All profile containers run `zeno-agent:dev` from a single `docker build`. Per-profile image tagging is out of scope.
- **Port range `[6101, 6200]`.** 100 ports allocated for profile dashboards. Port `6100` is unused (no admin container exists in this spec).
- **All host-side state lives under `~/.zeno/`.** Repo at `~/.zeno/zeno-agent/`, state DB at `~/.zeno/state.db`, profile data at `~/.zeno/profiles/<name>/`. Templates committed under `~/.zeno/zeno-agent/templates/profile/` (i.e. `${ZENO_HOME}/templates/profile/`). The `templates/profile/` directory contains exactly three files: `USER.md` (markdown template with placeholder `<your-name>` for the operator's name and `<auto-detected-tz>` for the timezone, both substituted by the CLI on `profile create`), `env.template` (key=value file with `ZENO_MASTER_KEY=<generated>` and any other env vars Zeno reads at runtime, also substituted by the CLI), and `README.md` (a short maintainer-facing note explaining that these files are read-only scaffolds for the CLI and not meant to be edited by operators in their instances). Belt-and-suspenders: `.gitignore` blocks the entire `profiles/` path at repo root.

## User Stories / Scenarios

1. **First install on a fresh machine.** Operator runs `curl -fsSL .../install.sh | sh`. Script verifies prerequisites (`git`, `docker`, Node ≥24, pnpm ≥10), creates `~/.zeno/`, clones into `~/.zeno/zeno-agent/`, runs `pnpm install --frozen-lockfile && pnpm build --filter @zeno/cli`, and writes the `~/.local/bin/zeno` symlink. Output ends with `Next: zeno profile create <profile>`.

2. **Create the first profile.** Operator runs `zeno profile create personal`. CLI prompts: `How should Zeno call you?`. Operator types `Alice`. CLI auto-detects timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`, allocates the next free port (`6101`), generates a 64-hex `ZENO_MASTER_KEY`, copies `templates/profile/USER.md` and `templates/profile/env.template` into `~/.zeno/profiles/personal/` with placeholders substituted, INSERTs a row into `state.db.profiles`, appends `profile.create` to `audit_log`. Output instructs: `Edit ~/.zeno/profiles/personal/USER.md to add Preferences and Context. Then: zeno start personal`.

3. **Start a profile.** Operator runs `zeno start personal`. CLI calls `docker image inspect zeno-agent:dev`; on first run it returns non-zero, so the CLI executes `docker build -t zeno-agent:dev -f infra/Dockerfile .` (with spinner indicating a multi-second operation), then calls `containerCreate` via `dockerode` with name `zeno-personal`, labels (`zeno.managed=true`, `zeno.profile=personal`, `zeno.port=6101`), port binding `6101:3000`, the four mounts (two named volumes + two read-only binds), then `containerStart`. Output prints `Container zeno-personal started. Dashboard: http://localhost:6101`. State updates: profile `status = 'running'`, `last_started_at = now`. The CLI does not store an "image built" flag; subsequent invocations consult `docker image inspect` again.

4. **Create a second profile with explicit port.** Operator runs `zeno profile create work --owner "Alice" --port 6105`. Skips prompt (owner via flag). Allocates port `6105` (validated against UNIQUE constraint). Same flow as personal.

5. **Inventory.** Operator runs `zeno profile list`. CLI queries `state.db.profiles` joined with live container status from `docker ps --filter label=zeno.managed=true`, prints a table:
   ```
     NAME       PORT   STATUS    UPTIME
     ───────────────────────────────────
   * personal   6101   ● running  2h 13m
     work       6105   ○ stopped  -
   ```

6. **Lifecycle of all profiles at once.** Operator runs `zeno start --all`. CLI iterates over every row in `state.db.profiles`, starting each container in turn. Same for `--all` on `stop`/`restart`.

7. **Sticky default.** Operator runs `zeno profile use personal`. CLI sets `state.db.settings('current_profile', 'personal')`. Subsequent `zeno start` (no positional arg) implicitly targets `personal`. `zeno start work` overrides for that single invocation without changing sticky.

8. **Edit port, restart.** Operator runs `zeno profile edit work --port 6110`. CLI updates the row, audits, prints `restart required`. Operator runs `zeno restart work`; CLI stops + removes the existing container (via `containerStop` + `containerRemove`), creates a fresh container with the new port binding, starts it.

9. **Force rebuild.** Operator pulls latest connectors-catalog change, runs `zeno restart personal --build`. CLI rebuilds `zeno-agent:dev` (spinner), then restarts.

10. **Upgrade to a newer Zeno version.** Operator runs `zeno upgrade --list`, sees five recent releases plus `edge`, picks `zeno upgrade --to v2026.5.10`. CLI runs `git fetch --tags && git checkout v2026.5.10 && pnpm install --frozen-lockfile && pnpm build --filter @zeno/cli && docker build -t zeno-agent:dev`. State updates `current_version`. Audit logged.

11. **Health check.** Operator suspects something is off, runs `zeno doctor`. CLI tests Docker daemon reachability, repo path, state DB open, schema migrations applied, drift between `state.db.profiles` and Docker-reality (containers with `zeno.managed=true`), reports each as ✓ or ✗.

12. **Delete a profile.** Operator no longer needs `acme`, runs `zeno profile delete acme`. CLI prints the destructive scope (container, volumes, directory, DB row), prompts `Type 'acme' to confirm:`. Operator types it. CLI stops + removes the container, removes both volumes, deletes `~/.zeno/profiles/acme/`, removes the DB row, audits, clears sticky default if it was `acme`.

13. **Operator opens a profile dashboard.** `zeno open personal`. CLI reads the port from DB, opens `http://localhost:6101` in the system browser (`open` on macOS, `xdg-open` on Linux, `wslview` on WSL).

14. **Drift recovery.** Operator runs `docker rm -f zeno-personal` manually. State DB still says `running`. Operator runs `zeno doctor`; CLI reports `drift: profile 'personal' marked running but no container with label zeno.profile=personal exists`. Operator runs `zeno start personal` to recreate.

## Acceptance Criteria

### Install path

- [ ] `infra/install.sh` clones into `~/.zeno/zeno-agent/` exactly. The script does not honor a `ZENO_HOME` env var: invoking with `ZENO_HOME=/tmp/x infra/install.sh` silently ignores the variable and still clones into `~/.zeno/zeno-agent/`. The script does not reference `ZENO_HOME` anywhere (verifiable: `grep -i 'zeno_home' infra/install.sh` returns no matches).
- [ ] `infra/install.sh` creates `~/.zeno/` if it does not exist.
- [ ] `infra/install.sh` creates the symlink `~/.local/bin/zeno` pointing to `~/.zeno/zeno-agent/apps/cli/dist/index.js`.
- [ ] Running `infra/install.sh` when `~/.zeno/zeno-agent/` already exists exits non-zero with a deterministic error message recommending `zeno upgrade` or removing the directory.
- [ ] Running `infra/install.sh` with any of `git`, `docker`, Node ≥ 24, or pnpm ≥ 10 missing exits non-zero and prints the missing tool plus an install URL.
- [ ] After a successful install, `~/.local/bin/zeno --version` prints `zeno v<version>` matching the value in `~/.zeno/zeno-agent/package.json`.
- [ ] The install script's final output includes the line `Next:  zeno profile create <profile>`.
- [ ] `infra/install.sh` runs identically under macOS `/bin/sh`, Linux `dash`, `ash`, and BusyBox (verified by passing `shellcheck -s sh`).

### Filesystem layout (post-install)

- [ ] `~/.zeno/zeno-agent/` exists and is a clean clone of the repo.
- [ ] `~/.zeno/state.db` does not yet exist (created lazily on first CLI invocation).
- [ ] `~/.zeno/profiles/` does not yet exist (created on first `profile create`).
- [ ] `~/.local/bin/zeno` exists and is executable.
- [ ] `templates/profile/USER.md`, `templates/profile/env.template`, and `templates/profile/README.md` exist inside the cloned repo.
- [ ] The repo root does not contain a `profiles/` directory.
- [ ] The repo root contains no `infra/docker-compose.*.yml` files.
- [ ] The repo's `.gitignore` includes the line `profiles/` and no longer whitelists any `profiles/default/*.example.*` paths.

### CLI surface — present commands

- [ ] `zeno profile create <profile>` exists and runs.
- [ ] `zeno profile list`, `zeno profile show <profile>`, `zeno profile edit <profile> --port <N>`, `zeno profile delete <profile>`, `zeno profile use <profile>` exist and run.
- [ ] `zeno start [profile|--all] [--build]`, `zeno stop [profile|--all]`, `zeno restart [profile|--all] [--build]` exist and run.
- [ ] `zeno logs [profile] [--tail <N>]`, `zeno open [profile]` exist and run.
- [ ] `zeno doctor`, `zeno upgrade [--list|--to <v>|--prerelease|--edge]`, `zeno repo` exist and run.
- [ ] `zeno repo` prints exactly `~/.zeno/zeno-agent` (literal tilde, no expansion) to stdout followed by a newline, and exits 0. Operator chains it via `cd $(zeno repo)` or `code $(eval echo $(zeno repo))` to navigate or open the repo. The CLI does not invoke any editor itself.
- [ ] `zeno profile show <profile>` prints a key/value block with one field per line including: `Port`, `Status`, `Created`, `Last started`, `Last stopped`, `Uptime` (only when running), `Dashboard` (URL `http://localhost:<port>`), `Container name` (`zeno-<profile>`), `Image` (`zeno-agent:dev`), `Volumes` (workspace + claude-home), `Mounts` (the four read-only and rw mounts). Exits 0 if the profile exists; exits ≠ 0 with `profile '<profile>' not found` if absent.
- [ ] `zeno open <profile>` resolves the port from `state.db.profiles`, builds `http://localhost:<port>`, and execs the platform-appropriate opener: `open` on macOS (verified via `process.platform === 'darwin'`), `xdg-open` on Linux (`process.platform === 'linux'` and `process.env.WSL_DISTRO_NAME` unset), `wslview` on WSL (`process.env.WSL_DISTRO_NAME` set). Propagates the opener's exit code. Fails with exit ≠ 0 and message `profile '<profile>' not found` if the profile does not exist.
- [ ] `zeno open` (no positional argument) follows the same sticky-default pattern as the lifecycle commands: uses `state.db.settings.current_profile` if set; otherwise exits ≠ 0 with the same `no profile specified and no sticky profile set` message.
- [ ] `zeno --version` and `zeno --help` print expected output and exit 0.

### CLI surface — removed commands

- [ ] `zeno status` does not exist (returns `unknown command` error).
- [ ] `zeno shell` does not exist.
- [ ] `zeno build` does not exist.
- [ ] `zeno docker` does not exist.
- [ ] `zeno update` does not exist (renamed to `upgrade`).

### Profile create

- [ ] `zeno profile create personal` (no flags, no sticky) prompts: `How should Zeno call you?` and writes the typed value into `~/.zeno/profiles/personal/USER.md` as `**Name:** <typed>`.
- [ ] `zeno profile create personal --owner "Alice"` skips the name prompt and writes `**Name:** Alice`.
- [ ] `zeno profile create personal -y` does not prompt; writes the placeholder `**Name:** <your-name>`.
- [ ] `zeno profile create personal` writes `**Timezone:** <tz>` to `USER.md` where `<tz>` is `Intl.DateTimeFormat().resolvedOptions().timeZone` of the host (e.g. `America/Sao_Paulo`).
- [ ] `zeno profile create personal` (no `--port`) allocates the lowest free port in `[6101, 6200]` not present in `state.db.profiles.port`.
- [ ] `zeno profile create personal --port 6105` uses port 6105 if free; fails with exit ≠ 0 and message `port 6105 already taken` otherwise.
- [ ] `zeno profile create personal --port 9999` fails with exit ≠ 0 and message `port must be integer in [6101, 6200]`.
- [ ] `zeno profile create UPPER` fails with exit ≠ 0 and message indicating regex `/^[a-z][a-z0-9-]{0,30}$/`.
- [ ] After `zeno profile create personal`, `~/.zeno/profiles/personal/` contains `.env` (with `ZENO_MASTER_KEY=<64 hex>`) and `USER.md` (rendered from template).
- [ ] After `zeno profile create personal`, `state.db.profiles` contains a row with `name='personal'`, `port` matching, `master_key` matching the value in `.env`, `status='stopped'`, `created_at` populated.
- [ ] After `zeno profile create personal`, `state.db.audit_log` contains a row with `action='profile.create'`, `target='personal'`, JSON details containing `port`.

### Lifecycle

- [ ] `zeno start personal` triggers `docker build -t zeno-agent:dev -f infra/Dockerfile .` if and only if `docker image inspect zeno-agent:dev` returns non-zero (image absent). Docker is the source of truth for image existence; the CLI does not maintain a separate `image_built` flag in state.
- [ ] `zeno start personal --build` executes `docker build -t zeno-agent:dev -f infra/Dockerfile .` unconditionally, even when the image already exists locally.
- [ ] On every `zeno start <profile>`, the CLI rewrites `~/.zeno/profiles/<profile>/.env` from `state.db.profiles.master_key` so that `ZENO_MASTER_KEY=<value>` always matches the canonical DB value. Existing keys other than `ZENO_MASTER_KEY` are preserved verbatim, in the order they appear in the file before the rewrite. New keys never injected by the CLI (operator-added env vars) survive the rewrite intact. The first line of the rewritten file is the comment `# managed by zeno CLI — manual edits to ZENO_MASTER_KEY will be overwritten on next start`.
- [ ] `zeno start personal` creates a Docker container with name `zeno-personal`, labels `zeno.managed=true`, `zeno.profile=personal`, `zeno.port=<port>` (verifiable via `docker inspect`).
- [ ] `zeno start personal` configures the container with: volume `zeno-personal-workspace` → `/workspace`; volume `zeno-personal-claude-home` → `/home/node/.claude`; bind `~/.zeno/zeno-agent/agent` → `/app/agent` (read-only); bind `~/.zeno/profiles/personal` → `/app/profile` (read-only).
- [ ] `zeno start personal` configures the port binding `<port>:3000`.
- [ ] `zeno start personal` sets `RestartPolicy = unless-stopped`.
- [ ] After `zeno start personal`, `state.db.profiles.status` for personal is `'running'` and `last_started_at` is populated.
- [ ] `zeno stop personal` calls `containerStop` (via `dockerode`) and updates `state.db.profiles.status` to `'stopped'` and `last_stopped_at` to now.
- [ ] `zeno restart personal` results in a container with `status='running'` after the call returns; `last_started_at` is more recent than before the call.
- [ ] `zeno start --all`, `zeno stop --all`, `zeno restart --all` iterate over all profiles in `state.db.profiles`.
- [ ] When `--all` is used, the iterator does not stop on the first per-profile failure: it processes every remaining profile, then exits with the OR of the per-profile exit codes (0 only if every profile succeeded). Failures are printed inline with the failing profile's name; a final summary line counts successes/failures.
- [ ] `zeno start` (no arg) with `state.db.settings.current_profile = 'personal'` starts personal.
- [ ] `zeno start` (no arg) with no sticky and no profiles fails with exit ≠ 0 and message including `no profile specified and no sticky profile set`.
- [ ] `zeno logs <profile>` streams via `docker logs -f --tail <N>` (default `--tail=50`) and runs until the operator interrupts with `^C`. The CLI propagates SIGINT to the underlying `dockerode` log stream.

### Profile delete

- [ ] `zeno profile delete personal` prompts: `Type 'personal' to confirm:` and aborts with exit ≠ 0 if the typed value does not match exactly.
- [ ] On confirmation, `zeno profile delete personal` removes the container `zeno-personal` (verifiable via `docker ps -a --filter name=zeno-personal` returning empty).
- [ ] On confirmation, removes both volumes `zeno-personal-workspace` and `zeno-personal-claude-home`.
- [ ] On confirmation, removes the directory `~/.zeno/profiles/personal/`.
- [ ] On confirmation, deletes the row from `state.db.profiles`.
- [ ] On confirmation, appends `action='profile.delete'`, `target='personal'` to `audit_log`.
- [ ] On confirmation, if `state.db.settings.current_profile` was `'personal'`, the value becomes `NULL`.

### Profile edit

- [ ] `zeno profile edit personal --port 6110` updates `state.db.profiles.port` to 6110 atomically.
- [ ] `zeno profile edit personal --port 6105` fails with exit ≠ 0 and message `port 6105 already taken` if 6105 is held by another profile.
- [ ] `zeno profile edit personal --port 6110` prints a `restart required` warning if the profile's status is `'running'`.
- [ ] `zeno profile edit personal --port 6110` appends `action='profile.edit'` to `audit_log` with JSON details `{ from: { port: <old> }, to: { port: 6110 } }`.

### Sticky profile

- [ ] `zeno profile use personal` writes `current_profile = 'personal'` to `state.db.settings`.
- [ ] `zeno profile use nonexistent` fails with exit ≠ 0 and message `profile 'nonexistent' not found`.
- [ ] `zeno start` (no positional, sticky set to `personal`) starts the personal container.
- [ ] `zeno start work` (positional given, sticky set to `personal`) starts work and does not modify sticky.

### State DB

- [ ] `~/.zeno/state.db` is created on first invocation of any `zeno` subcommand that needs state.
- [ ] On boot, `zeno *` commands run pending drizzle migrations from `apps/cli/src/db/migrations/` and append the applied versions to `schema_migrations`.
- [ ] After migrations, `PRAGMA journal_mode` returns `wal`.
- [ ] After migrations, the schema contains exactly the tables: `profiles`, `settings`, `audit_log`, `schema_migrations`.
- [ ] `profiles.port` enforces UNIQUE — attempting to INSERT a duplicate port via the drizzle queries throws.
- [ ] Re-running migrations on an already-migrated DB is a no-op (no new rows in `schema_migrations`, no errors).

### Doctor

- [ ] `zeno doctor` prints a per-check pass/fail line for: Docker daemon reachable, repo path exists, state DB open, schema migrations applied, installed version, running profiles count, sticky profile, drift between DB and Docker reality.
- [ ] `zeno doctor` exits 0 iff every non-skipped check passed.
- [ ] `zeno doctor` reports drift when a `state.db.profiles` row says `status='running'` but no Docker container with `zeno.profile=<name>` exists.
- [ ] `zeno doctor` reports drift when a Docker container with `zeno.managed=true` exists but no matching `state.db.profiles` row exists.

### Upgrade

- [ ] `zeno upgrade --list` lists releases. Source resolution: (a) if the `gh` binary is on PATH and `gh auth status` returns 0, use `gh release list --repo ribeirogab/zeno-agent --limit 10 --json tagName,isPrerelease,publishedAt,name`; (b) otherwise, fall back to an unauthenticated GET against `https://api.github.com/repos/ribeirogab/zeno-agent/releases?per_page=10` (subject to GitHub's 60-req/h unauthenticated rate limit, acceptable for single-user); (c) if both fail (no `gh`, no network), exit non-zero with message `cannot fetch releases: <error>` and instruct to retry with network or install `gh`. The output is sorted by `publishedAt` descending, marks pre-releases as `pre-release` (else `stable`), and prefixes the current installed version (from `state.db.settings.current_version`) with `*`.
- [ ] `zeno upgrade` (no flag) checks out the latest **stable** tag (excludes pre-releases) via `git fetch --tags && git checkout <tag>`.
- [ ] `zeno upgrade --prerelease` checks out the latest tag including pre-releases.
- [ ] `zeno upgrade --to v<X>` checks out tag `v<X>`; fails with exit ≠ 0 if the tag does not exist.
- [ ] `zeno upgrade --edge` checks out `main` and runs `git pull --ff-only`.
- [ ] After tag/branch checkout, `zeno upgrade` runs `pnpm install --frozen-lockfile && pnpm build --filter @zeno/cli && docker build -t zeno-agent:dev -f infra/Dockerfile .`.
- [ ] After successful upgrade, `state.db.settings.current_version` reflects the target tag (`v<X>`) or `edge`.
- [ ] After successful upgrade, `audit_log` contains `action='cli.upgrade'`, with JSON details `{ from: <old>, to: <new> }`.
- [ ] `zeno upgrade --to <current>` exits 0 without performing any work and prints `already on <version>`.
- [ ] `zeno upgrade --to <older>` (downgrade) prints a warning and requires `--force` to proceed.

### `config.yaml` removal

- [ ] `agent/config.example.yaml` is deleted from the repo.
- [ ] `apps/worker/src/cron/static-loader.ts` and `apps/worker/tests/cron/static-loader.test.ts` are deleted.
- [ ] `apps/worker/src/github/git-identity.ts` no longer imports `parse` from `yaml` and no longer references any `config.yaml` path. `resolveGitIdentity()` calls only `resolveGitIdentityFromGhCli()`.
- [ ] `apps/worker/tests/github/git-identity.test.ts` does not contain test cases for `parseGitIdentityFromConfig` (function removed).
- [ ] `apps/worker/src/profile/watcher.ts`: the `classify()` branch returning `'crons'` for `normalized === 'config.yaml'` is deleted; the `onCronsChanged` callback option is removed from `ProfileWatcherOptions`; the dispatch in the watcher's change handler that invokes `onCronsChanged` is deleted; every call site in `apps/worker/src/index.ts` (and elsewhere) that wired `onCronsChanged` and that called `loadStaticCrons` in response is deleted. Repo-wide grep `loadStaticCrons` and `onCronsChanged` returns zero matches outside historical specs.
- [ ] `infra/entrypoint.sh` is exactly the lines `#!/bin/sh`, `set -eu`, and `exec "$@"` (no yaml parsing). The git identity that the entrypoint previously set via `git config --global` from `config.yaml` is replaced by `apps/worker/src/index.ts` calling `resolveGitIdentity()` at boot **before any git operation reaches the agent**, and exporting `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` into `process.env`. The first git operation a connector or skill performs already inherits these values via the worker process env. Verifiable: spawn a `git commit` from inside a running container in a fresh workspace; the resulting commit's author is the value returned by `gh api /user`.
- [ ] Repo-wide grep `config\.ya?ml` returns matches only inside `.vault/specs/` (historical specs) — never under `apps/`, `packages/`, `agent/`, `infra/`, or root configuration files.

### Legacy file cleanup

- [ ] `infra/docker-compose.default.yml`, `infra/docker-compose.fn.yml`, `infra/docker.sh`, `infra/migrate-claude-home.sh` are deleted.
- [ ] `apps/cli/src/commands/docker.ts`, `apps/cli/src/commands/build.ts`, `apps/cli/src/commands/status.ts`, `apps/cli/src/commands/shell.ts`, `apps/cli/src/commands/update.ts` are deleted.
- [ ] `apps/cli/src/lib/compose.ts` is deleted.
- [ ] `apps/cli-next/` (the throwaway brainstorm prototype) is deleted entirely.
- [ ] Root `package.json` no longer contains `docker:build`, `docker:up`, `docker:down`, `docker:logs`, `docker:setup-token`, or `docker:sh` scripts.
- [ ] `CLAUDE.md`'s commands table reflects the new CLI surface (no `docker.sh`, no `pnpm run docker:*`).
- [ ] `README.md` reflects the new install path (`~/.zeno/zeno-agent/`) and CLI surface.

### `@zeno/db/host` package

- [ ] A new package `@zeno/db` exists at `packages/db/` with `package.json` exporting only the subpath `./host` (no root export).
- [ ] `packages/db/src/host/schema.ts` defines the four tables (`profiles`, `settings`, `audit_log`, `schema_migrations`) using `drizzle-orm/sqlite-core`.
- [ ] `packages/db/drizzle.host.config.ts` configures drizzle-kit with `schema: './src/host/schema.ts'`, `out: './src/host/migrations'`, `dialect: 'sqlite'`.
- [ ] `pnpm --filter @zeno/db run db:host:generate` regenerates migration SQL files without errors when the schema is unchanged.
- [ ] `apps/cli` imports its DB layer from `@zeno/db/host` (verified by `import { ... } from '@zeno/db/host'` appearing in CLI source).

### Quality gate

- [ ] `pnpm run quality-gate` (lint + typecheck + tests across all workspaces) exits 0.
- [ ] `pnpm --filter @zeno/cli build` produces `apps/cli/dist/index.js` with the `#!/usr/bin/env node` shebang.
- [ ] `pnpm --filter @zeno/db build` produces `packages/db/dist/host/index.js` and corresponding `.d.ts`.
- [ ] CI smoke test (gated on Docker availability) runs the full `create → start → list → stop → delete` flow against a real Docker daemon and asserts a clean state at the end.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| CLI is root-equivalent via Docker socket; a CLI bug could allow privileged container creation and host escape. | `dockerode` typed API (no string-concat into shell), validate all input that flows into `containerCreate` (no path traversal in mounts, port range enforced, name regex enforced). CLI runs as the operator's user, never sudo. Profile dashboards bind 127.0.0.1 only. Documented in `SECURITY.md`. |
| Concurrent CLI invocations could race on port allocation or audit-log ordering. | SQLite WAL mode + UNIQUE constraint on `profiles.port`. Each CLI operation runs inside a transaction. Second invocation receives a deterministic error from the constraint failure. |
| Drift between `state.db` and Docker reality (operator runs `docker rm` manually, kernel kills container). | `zeno doctor` reconciles by listing containers with `zeno.managed=true`, joining with DB rows, reporting both directions of drift. Operator decides whether to recreate or delete. |
| Accidental `rm -rf ~/.zeno/` destroys all profile state (state DB, profile dirs). | `SECURITY.md` documents the importance of backing up `~/.zeno/`. Backup tooling is backlog. Volumes are not under `~/.zeno/` — they survive (`docker volume ls`). |
| `state.db` corruption via mid-write kill or full disk. | WAL mode + `synchronous = NORMAL`. `zeno doctor` validates DB open and PRAGMA on each invocation. Operator can recover via `sqlite3 .recover`. |
| Drizzle migration failure mid-apply leaves DB in a half-migrated state. | Forward-only migrations, each wrapped in a transaction. Migration runner aborts on first failure without committing. CI runs migrations on both empty DBs and existing-state DBs. |
| Profile dashboard port conflict — `6101+` is bound by something else on the host. | `zeno start` propagates the Docker error message; operator resolves via `zeno profile edit <profile> --port <new>`. Future `zeno doctor` could probe ports proactively. |
| `dockerode` incompatibility after Docker Desktop or Engine update. | Pin major version in `package.json`. CI smoke test calls `docker info` before lifecycle assertions; failure surfaces at PR time. |
| Operator downgrades via `zeno upgrade --to <older>` to a version with an older schema, causing migration mismatch. | `upgrade` warns when target version is older than current and requires `--force`. Migrations are forward-only; downgrade is best-effort. |
| Conflict between legacy install (`~/zeno-agent`) and new install (`~/.zeno/zeno-agent`) coexisting on the same machine. | `infra/install.sh` detects the legacy path and prints an explicit instruction to remove it after backing up profile data manually. |
| Operator hand-edits `~/.zeno/profiles/<name>/.env` and changes `ZENO_MASTER_KEY`, corrupting encrypted tokens in the runtime `zeno.db`. | CLI rewrites `.env` on `start` from the canonical `state.db.profiles.master_key` value. The `.env` template includes a header comment: `# managed by zeno CLI — manual edits to ZENO_MASTER_KEY will be overwritten`. `zeno doctor` reports drift. |
| On Linux, the operator's user lacks Docker socket permission, causing every command to fail with a permission error. | `zeno doctor` tests `docker info` and prints an instructional remediation: `add yourself to the docker group: sudo usermod -aG docker $USER`. |
| `state.db.profiles.master_key` is stored plaintext (the SQLite file is not encrypted at rest). Anyone with read access to `~/.zeno/state.db` can read every profile's `ZENO_MASTER_KEY` and decrypt the runtime DB tokens. | The CLI sets `~/.zeno/state.db` to `chmod 600` on creation (owner-only read/write). `SECURITY.md` documents that file-system access to the operator's home directory is the trust boundary, identical to the trust model of `~/.ssh/`, `~/.aws/credentials`, `~/.docker/config.json`. Encrypted state DB is backlog if a real threat model demands it. |

## Open Questions

None at this stage. All decisions locked across the 14 items reviewed during brainstorming. Items deferred to backlog are listed under [[#Non-Goals]].
