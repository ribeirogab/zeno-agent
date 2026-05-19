---
feature: zeno-cli
spec: "[[spec-zeno-cli]]"
created: 2026-05-07
---
# Zeno CLI — Plan

**For this spec:** `[[spec-zeno-cli]]`

## Approach

Add a new `apps/cli` workspace built with `citty` and bundled with `tsup` to a single ESM `dist/index.js` that carries its own shebang. The CLI is a thin orchestrator: small command modules call into shared `lib/` helpers (`zeno-home`, `profile`, `state`, `compose`, `version`) which encapsulate every piece of dynamic behavior (path resolution, JSON state I/O, compose process spawning). Subcommand modules stay near-trivial: parse flags, resolve context, exec compose. This split keeps the testable surface (lib helpers) cleanly separated from the side-effecting surface (subcommand handlers that spawn child processes).

The non-compose subcommands (`doctor`, `open`, `update`, `profile {use,show,list}`) live in their own modules and follow the same lib-driven pattern. `update` is the only one that mutates the working tree (`git pull`, `pnpm install`, `pnpm build`); it bails on first failure rather than try to recover. The release workflow change is a surgical edit to `.github/workflows/release.yml` that adds Node + pnpm setup steps and a `Bump version` step that pushes a `chore(release): <tag>` commit to `main` before tagging it. `infra/install.sh` is a POSIX-`sh` script with no bash-isms, hosted at the repo root path so the README's `curl | sh` one-liner can target raw GitHub.

Implementation order is bottom-up: Discovery (verify citty + tsup current APIs) → workspace scaffolding → shared lib (with tests) → command modules → CLI wire-up → install.sh → release workflow → docs. Each phase produces working software; nothing is "deferred to the end". The plan finishes with manual verification of the install path and a `pnpm run quality-gate` pass.

## Architecture

```
                         Operator (any cwd)
                                │
                                ▼
                       ~/.local/bin/zeno  (symlink)
                                │
                                ▼
                $ZENO_HOME/apps/cli/dist/index.js  (citty CLI, ESM)
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
      lib/zeno-home.ts   lib/profile.ts     lib/compose.ts
      (resolves path)    (chain: flag→env   (spawns docker compose
                          →state→default)    with -f / --project-directory)
                                │
                                ▼
                        lib/state.ts
                        (read/write apps/cli/.state.json)

      Subcommand modules under src/commands/:

        start.ts ──┐
        stop.ts   │   all use compose helper
        restart.ts│   inherit stdio
        build.ts  │   propagate exit code
        status.ts │
        logs.ts   │
        shell.ts  │
        docker.ts ┘

        doctor.ts   ── direct child_process spawns + node:net checks
        open.ts     ── child_process spawn of platform opener
        update.ts   ── chained child_process spawns (git → pnpm → pnpm)
        profile.ts  ── glob compose files + read/write state
```

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `apps/cli/package.json` | Workspace manifest. `name: "@zeno/cli"`, `bin: {"zeno": "./dist/index.js"}`, `type: "module"`, dev dep on `tsup`, runtime dep on `citty`. |
| `apps/cli/tsconfig.json` | Extends `tsconfig.base.json`. Outputs to `dist/`. Strict mode inherited. |
| `apps/cli/tsup.config.ts` | Bundle config: entry `src/index.ts`, format ESM, target node24, banner `#!/usr/bin/env node`, externalize `node_modules`. |
| `apps/cli/vitest.config.ts` | Vitest config for unit tests of lib functions. |
| `apps/cli/src/index.ts` | Root `defineCommand` with metadata, root flags (`--profile`), `subCommands` map. |
| `apps/cli/src/lib/zeno-home.ts` | `resolveZenoHome(): string` reads `process.env.ZENO_HOME` or falls back to `path.join(os.homedir(), 'zeno-agent')`. |
| `apps/cli/src/lib/state.ts` | `readState(home): { profile?: string }`, `writeState(home, state): void`. Reads/writes `apps/cli/.state.json` relative to `home`. |
| `apps/cli/src/lib/profile.ts` | `resolveProfile(opts): { name: string, source: 'flag'\|'env'\|'state'\|'default' }`. Inputs: explicit flag, env var, state object. Output: chosen profile + provenance. Pure function; no I/O. |
| `apps/cli/src/lib/compose.ts` | `composeArgs(home, profile): string[]` returns `['-f', 'infra/docker-compose.<profile>.yml', '--project-directory', home]`. `runCompose(home, profile, args): Promise<number>` spawns `docker compose` with stdio inherited and resolves with exit code. `composeFileExists(home, profile): boolean`. |
| `apps/cli/src/lib/version.ts` | `readVersion(home): string` reads `package.json` at `home`, returns `version` field. Throws if file missing. |
| `apps/cli/src/lib/profile-list.ts` | `listProfiles(home): string[]` globs `infra/docker-compose.*.yml` and returns the captured names. |
| `apps/cli/src/commands/start.ts` | `defineCommand`. Calls `runCompose(home, profile, ['up', '-d'])`. |
| `apps/cli/src/commands/stop.ts` | `defineCommand`. Calls `runCompose(home, profile, ['down'])`. |
| `apps/cli/src/commands/restart.ts` | `defineCommand`. Runs stop; if 0, runs start. |
| `apps/cli/src/commands/status.ts` | `defineCommand`. Calls `runCompose(home, profile, ['ps'])`. |
| `apps/cli/src/commands/shell.ts` | `defineCommand`. Calls `runCompose(home, profile, ['exec', 'agent', 'bash'])`. |
| `apps/cli/src/commands/logs.ts` | `defineCommand` with `--tail`, `--service`. Builds `['logs', '-f', '--tail', String(tail)]` then optionally appends service name. |
| `apps/cli/src/commands/build.ts` | `defineCommand` with `--no-cache`. Builds `['build']` + optional `--no-cache`. |
| `apps/cli/src/commands/docker.ts` | `defineCommand` with positional varargs. Forwards args verbatim to `runCompose`. |
| `apps/cli/src/commands/open.ts` | `defineCommand`. Detects platform via `process.platform`, execs `open` / `xdg-open` / `wslview` against `http://localhost:3000`. |
| `apps/cli/src/commands/update.ts` | `defineCommand`. Chains `git pull --ff-only` → `pnpm install --frozen-lockfile` → `pnpm build --filter @zeno/cli` in `home`. Aborts on first non-zero exit. |
| `apps/cli/src/commands/doctor.ts` | `defineCommand`. Runs the 6 checks from spec AC, prints a status table, exits 0 only if all non-skipped checks pass. |
| `apps/cli/src/commands/profile.ts` | `defineCommand` with nested `subCommands: { use, show, list }`. |
| `apps/cli/src/commands/profile-use.ts` | `defineCommand` with positional `<name>`. Validates compose file exists; writes state. |
| `apps/cli/src/commands/profile-show.ts` | `defineCommand`. Calls `resolveProfile`, prints `profile: <name> (source: <source>)`. |
| `apps/cli/src/commands/profile-list.ts` | `defineCommand`. Lists names from `listProfiles`, marks current with `*`. |
| `apps/cli/src/lib/__tests__/profile.test.ts` | Unit tests for `resolveProfile` covering all 4 chain branches + flag-overrides-everything. |
| `apps/cli/src/lib/__tests__/state.test.ts` | Unit tests for `readState`/`writeState` round-trip + missing-file handling, using `tmpdir`. |
| `apps/cli/src/lib/__tests__/compose.test.ts` | Unit tests for `composeArgs` (deterministic output) and `composeFileExists`. |
| `apps/cli/src/lib/__tests__/profile-list.test.ts` | Unit tests for `listProfiles` against a fixture directory. |
| `infra/install.sh` | POSIX `sh` installer. See spec §"User Stories — First install" for the full flow. |

### Modified

| Path | Change |
|---|---|
| `pnpm-workspace.yaml` | No-op (already covers `apps/*`). Verify by inspection. |
| `tsconfig.base.json` | No-op unless the existing config conflicts with citty's ESM resolution. Verify by inspection. |
| `turbo.json` | If pipeline tasks (`build`, `lint`, `typecheck`, `test`) require explicit registration per workspace, add `@zeno/cli` to relevant pipelines. Inspect first. |
| `package.json` (root) | No new scripts in this spec (pnpm scripts stay). Verify no name collisions. Workflow will eventually bump `version`. |
| `.gitignore` | Append `apps/cli/dist` and `apps/cli/.state.json`. |
| `.github/workflows/release.yml` | Add `actions/setup-node@v4` + `pnpm/action-setup@v4`; add `Bump version` step that runs `pnpm version` + commits + pushes to `main`; tag the bump commit instead of the original HEAD. |
| `README.md` | Replace Quickstart block with the install one-liner + Configure + Run + Daily ops sections. Keep prereqs, what-works, contributing. |
| `AGENTS.md` | Replace `pnpm run docker:*` rows in the commands table with the `zeno` surface as the primary entry point. Keep `pnpm run quality-gate`. |

### NOT modified (explicit non-changes)

- `infra/docker.sh`, `infra/docker-compose.*.yml`, `infra/Dockerfile`, `infra/entrypoint.sh` — CLI delegates to compose directly; the existing shell glue stays intact and remains usable for non-CLI flows.
- `agent/`, `apps/{api,worker,dashboard}/`, `packages/*` — out of scope.
- `package.json` `scripts.docker:*` — kept as fallback per spec Non-Goals.

## Phase Ordering

Phase 0 — Discovery. Verify current `citty` and `tsup` versions and idioms via context7. Capture short notes per `[[learnings]]` if anything diverges from training-data assumptions.

Phase 1 — Workspace scaffolding. Add `apps/cli` with `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, an empty `src/index.ts` that compiles. Goal: `pnpm build --filter @zeno/cli` produces a runnable `dist/index.js`.

Phase 2 — Shared lib + tests. Implement `zeno-home`, `state`, `profile`, `compose`, `version`, `profile-list` with TDD. Tests run in `vitest` against the resolved `apps/cli` package.

Phase 3 — Container lifecycle commands (start/stop/restart/build/status/shell/logs/docker). Each command module is small; the test surface is in lib (already covered in Phase 2).

Phase 4 — Profile commands (use/show/list).

Phase 5 — Non-compose commands (doctor/open/update).

Phase 6 — CLI wire-up. Root `defineCommand` with `subCommands` map and the global `--profile` flag. Verify `dist/index.js` runs and `--help` lists the surface.

Phase 7 — `infra/install.sh`. Authoring + `shellcheck` lint + manual end-to-end into a temp `ZENO_HOME`.

Phase 8 — Release workflow change. Patch `.github/workflows/release.yml`. No live test of the workflow until next release run; spec acceptance via inspection.

Phase 9 — Docs + repo hygiene. README + AGENTS.md + `.gitignore`.

Phase 10 — Quality gate + verification. `pnpm run quality-gate`, manual install, manual `zeno start && zeno status && zeno logs && zeno stop` against the `default` profile.

Phase 11 — Reflection + close. Per the project rule, write any non-obvious learning into `.vault/learnings/` and link it from this spec.

## Risks / Open Decisions

- **Branch protection on `main`** may block `git push origin HEAD:main` from the release workflow's GH Actions bot. Verify before merging Phase 8 (`gh api repos/ribeirogab/zeno-agent/branches/main/protection`). If blocked, decision: (a) grant `github-actions[bot]` an exception, or (b) switch to a deploy-key / app-token push. The implementer must surface this finding before merging the workflow change.
- **`pnpm version` on private root.** Risk row in spec §Risks. Implementer must run `cd <tmp clone> && pnpm version 2026.5.7 --no-git-tag-version` against `pnpm@10.33.0` once before Phase 8 lands. If it refuses, halt and reopen the spec.
- **`citty` API drift.** Phase 0 covers this. Anything unexpected becomes a learning under `.vault/learnings/`.
- **Symlink resolution & node_modules.** The bundled `dist/index.js` is symlinked into `~/.local/bin`. Node's module resolution walks up from the file's *real* path (after symlink resolution), so `node_modules` at `$ZENO_HOME/node_modules` resolves correctly. Verify in Phase 10 by running `zeno --version` from `/tmp`.
- **CalVer suffix preservation.** The bump step uses `${TAG#v}`, which preserves any `.N` suffix from the existing collision-handling logic. Already covered in spec; flagged here because a future tag-format change could break it silently.
