---
status: draft
feature: cli-ux-overhaul
created: 2026-05-09
shipped: null
---
# CLI UX Overhaul — Design Spec

**Status:** Draft
**Scope:** Single PR, single spec, single feature branch (`feat/cli-ux-overhaul`). Cover 39 items across five areas — security/correctness fixes (A), `install.sh` flag overhaul (B), `zeno upgrade` flag parity (C), picker fallback for missing args (D), and general UX polish (E) — to make the `zeno` CLI consistent, discoverable, and safe for both human operators and AI agents driving it without TTY.

Tracks issue [#60](https://github.com/ribeirogab/zeno-agent/issues/60).

## Brainstorm Q&A

This spec was born out of an explicit `/brainstorming` session. Decisions below are locked unless re-opened in writing.

### Q1 — Architecture of the picker-fallback resolver

**Decision: B — typed helpers per arg kind.** Each argument that may need a picker (profile, connector slug, catalog id, secret key, tool name, tool permission) gets a dedicated helper in `apps/cli/src/lib/resolvers.ts`: `resolveProfile`, `resolveConnector`, `resolveCatalog`, `resolveSecretKey`, `resolveTool`, `resolvePermission`.

**Reasons:** each kind has a distinct source (state.db vs HTTP API vs static enum), distinct hint policy (only `resolveProfile` emits `tip: zeno profile use ...`), and distinct loading strategy. A single generic `resolveArg<T>(...)` would push all that variation into call-site config and lose static type safety. Six call sites do not justify the abstraction.

**Trade-off accepted:** six small files instead of one. Boilerplate grows linearly.

### Q2 — Format of `~/.zeno/zeno-agent/.installed-from`

**Decision: A — single line `kind:value@sha`.**

```
tag:v2026.5.7@a1b2c3d
branch:feat/foo@a1b2c3d
pr:123@a1b2c3d
unstable:@a1b2c3d
```

**Reasons:** trivial to write/read in both POSIX sh (`install.sh`) and TypeScript (`zeno upgrade`, `zeno --version`). No `jq` dependency in `install.sh`. Future extension via append-only history lines is possible without breaking the v1 parser.

**Trade-off accepted:** less expressive than JSON. Acceptable: only four fields needed.

### Q3 — Data source for `zeno status`

**Decision: B — full fan-out HTTP.** The command resolves the inventory of profiles from `state.db`, then in parallel hits each running profile's worker API for connectors, last cron run, and last error. Profiles that are stopped skip the HTTP calls and render `stopped`. Per-profile timeout: 1s; on timeout the affected field renders `?`.

**Reasons:** the value of a status command is the whole picture in one screen. A "light" mode that only reads `state.db` + Docker socket would just duplicate `zeno profile list` with cosmetic changes. Worth the HTTP cost.

**Trade-off accepted:** ~200–500ms per running profile (parallel). Not real-time-fast, but acceptable for a humanly-driven status check.

### Q4 — `--json` schema strategy

**Decision: B — per-command schema documented in `apps/docs/content/docs/cli.mdx`, no envelope, no version field.** Each command that supports `--json` exports its response type from `apps/cli/src/types/json-output.ts`. Breaking changes are called out in release notes.

**Reasons:** contract exists (not silent), but lightweight. Versioning with an envelope (`{ version: 1, data: ... }`) is YAGNI while Zeno is single-user and pre-1.0. Add it when an external integrator appears.

**Trade-off accepted:** breaking changes require explicit release notes. Acceptable.

### Q5 — Atomicity of `zeno upgrade` (replaces "rollback flag")

**Decision: reorder pipeline + auto-revert inline.** No separate `--rollback` flag. Two-part fix:

1. **Pipeline order** — `setVersion` and `writeMeta` move from after-build to immediately after `git checkout`. The DB and `.installed-from` always reflect the on-disk git state, even if a later step fails.
2. **Auto-revert inline** — if any step after checkout fails (install / build CLI / build image), the upgrade catches the error, re-runs `git checkout` against the previous `.installed-from`, restores `setVersion`/`writeMeta`, and exits 1 with a clear message.

**Reasons:** a separate `zeno upgrade --rollback` flag is sugar — `zeno upgrade --to <prev_tag>` already covers the "I want to go back" case. The actual bug is the mismatch between `state.db`/git when build fails. Reordering + inline revert resolves it without adding a flag.

**Trade-off accepted:** `zeno upgrade` becomes responsible for its own cleanup. Acceptable: the work is bounded and the alternative (let the operator manually reset) violates the "fail noisily and as soon as possible" rule.

#### New pipeline structure

The current `apps/cli/src/lib/upgrade.ts` exports `upgradeSteps` with 5 methods (`fetchTags`, `checkoutTag`, `installDeps`, `buildCli`, `buildImage`). This spec promotes `setVersion` and `writeMeta` from post-build side-effects in `commands/upgrade.ts` into named members of the same `upgradeSteps` object, yielding **seven enumerated steps** in execution order:

```
1. fetchTags()
2. checkoutRef(target, kind)        // renamed from checkoutTag — supports tag/branch/pr/unstable
3. setVersion(display)              // promoted from post-build side-effect
4. writeMeta(meta)                  // NEW — moved out of inline call
5. installDeps()
6. buildCli()
7. buildImage()
```

#### `writeMeta` helper (new)

Lives in `apps/cli/src/lib/version-meta.ts`. Signature:

```ts
export type VersionKind = 'tag' | 'branch' | 'pr' | 'unstable';
export interface VersionMeta { kind: VersionKind; value: string; sha: string }

export function writeMeta(meta: VersionMeta): void  // writes ~/.zeno/zeno-agent/.installed-from
export function readMeta(): VersionMeta | null      // null if file absent
export function formatDisplay(meta: VersionMeta): string  // for `zeno --version`
export function compareSemver(a: string, b: string): number  // for downgrade guard
```

**Module boundary:** `version-meta.ts` is the single source of truth for the `.installed-from` format and semver comparison. `upgradeSteps.writeMeta(meta)` in `lib/upgrade.ts` is a one-line wrapper that imports and calls `versionMeta.writeMeta(meta)`; it exists only so that `writeMeta` can be one of the seven enumerated steps in `upgradeSteps` (uniform pipeline iteration in `--dry-run` and the auto-revert handler). `readMeta`, `formatDisplay`, and `compareSemver` are NOT members of `upgradeSteps` — callers (auto-revert handler, `zeno --version`, downgrade guard) import them directly from `version-meta.ts`.

**Internal constant rename:** `EDGE_TAG = 'edge'` in `lib/upgrade.ts:15` is removed. The `kind` discriminator on `VersionMeta` (`'tag' | 'branch' | 'pr' | 'unstable'`) replaces it. The legacy `EDGE` export is removed; any callers of `EDGE` are updated to compare `meta.kind === 'unstable'`. The downgrade guard in `commands/upgrade.ts:82` resolves the candidate `kind` from the chosen target before applying `compareSemver`; if `kind !== 'tag'`, the semver comparison is skipped (no downgrade check for branch/pr/unstable).

**Empty-releases fallback:** when `listReleases()` returns an empty array (no tags in the repo at all), both `pickLatestStable` (in `commands/upgrade.ts`, used in non-TTY upgrade default) and `install.sh`'s fallback chain return `unstable` (main HEAD). This single behavior keeps upgrader and installer aligned per B5.

`install.sh` writes the same line format directly via shell (no shared library).

### Q6 — Location of the friendly-error mapping table

**Decision: B — separate `apps/cli/src/lib/errors.ts`.** A typed table `Record<string, (e: ApiError) => Hint>` maps known upstream codes to `{ msg, hint? }`. `ApiClient` continues to throw the raw `ApiError`; callers (or a `runCommand(fn)` wrapper) call `friendly(e)` before printing.

**Reasons:** separates policy (mapping) from mechanism (HTTP transport) per Constitution rule 4. The table is testable in isolation. New mappings land in one place.

**Trade-off accepted:** ~50 lines of table to maintain. Cheap.

### Q7 — Renaming convention: `--unstable` over `--edge` / `--beta`

**Decision: rename `--edge` → `--unstable` in `zeno upgrade`. Rename `--beta` → `--unstable` in `install.sh`. No deprecation aliases.**

**Reasons:** `--edge` and `--beta` are misnomers for "main HEAD with no CI gate" — Debian-`unstable` is the closer analogue (Docker-`edge` and Chrome-`beta` both imply some stabilization process Zeno does not have today). `--unstable` is honest. Pre-1.0 with no real users justifies skipping the deprecation period; clean rename now is cheaper than carrying aliases forward.

**Trade-off accepted:** anyone running an old `install.sh` and then trying `--beta` on the new one gets `unknown flag: --beta` and has to read `--help`. Acceptable for an experimental, single-user project.

## Context

The `zeno` CLI grew organically across multiple specs (multi-profile-cli #17, connectors-cli-first #54, CLI-only crons/channels/backend #56–#58 in flight). Several rough edges accumulated:

- Connector commands ignore the sticky profile and silently fall back to literal `'default'`, breaking workflows where the operator has set a sticky.
- `install.sh` claims its default is "latest stable" but actually clones `main` HEAD; the `--beta` flag exists in the README but does nothing in the script.
- `zeno upgrade --edge` exists and works but operators do not discover it; there is no way to point to a branch or PR for testing without manual `git checkout` outside the CLI.
- Several connector commands (`install`, `secret set`, `secret rotate`) prompt for secret values via plain `readline.question`, which echoes the value to the terminal despite docs claiming "no echo (TTY only)".
- Missing args exit with a help blurb instead of opening a picker, even in TTY sessions where prompting is the obvious move.

The CLI must remain fully driveable by AI agents (no required interaction): arg/flag passed → use it; arg missing in non-TTY → exit 1 with a clear error.

## Problem Statement

The CLI is inconsistent in three dimensions:

1. **Profile resolution** — every `zeno connector *` command bypasses the sticky profile via a hardcoded `'default'` literal, while every `zeno start/stop/restart/logs/open` command honors the sticky via `resolveName`. Twenty call sites diverge from five.
2. **Version targeting** — `install.sh` and `zeno upgrade` use different vocabularies (`--beta` vs `--edge`) for the same concept and offer different target sets (no `--branch` or `--pr` anywhere). The default of `install.sh` is wrong.
3. **Argument prompting** — when an arg is missing, some commands fail (`zeno start` without sticky), some default silently to a wrong value (`zeno connector list` → `'default'`), and none open an interactive picker even when TTY is available.

Plus the secret-prompt security regression and the semver string-compare bug.

## Non-Goals

- **Shell completion generator (`zeno completion <shell>`)** — out of scope. Discoverability handled by picker fallback + `--help`.
- **Multi-user / multi-host CLI** — the constitution forbids; not on the roadmap.
- **Schema changes to the runtime SQLite** — `state.db` (host) and the per-profile runtime DB stay as-is.
- **`--non-interactive` / `--ci` flag** — TTY detection (`process.stdout.isTTY && process.stdin.isTTY`) covers the case; an extra opt-out is redundant.
- **`ZENO_PROFILE` environment variable** — out of scope. The sticky profile (`zeno profile use`) is the canonical way to set a default.
- **Version envelope for `--json`** (`{ version, data }`) — YAGNI. Add when a real external integrator appears.
- **`zeno upgrade --rollback` flag** — `zeno upgrade --to <prev>` covers the case; atomicity bug is fixed inline.
- **Catastrophic-confirm pattern (`--confirm "<exact-name>"`)** — destructive ops standardize on prompt + `--yes`. The existing `connector app uninstall` confirmation is replaced with the standard pattern.
- **Hint persistence in DB** — the `tip: zeno profile use ...` line always shows when the picker fires; no "shown N times" state.
- **Backwards-compat aliases for `--edge` and `--beta`** — clean rename; no deprecation period (per Q7).
- **Channels, crons, backend CLI surface** — separate specs (#56, #57, #58) own those. This spec only addresses `profile`, `start/stop/restart/logs/open`, `connector *`, `upgrade`, `status` (new), `repo`, `doctor`.

## Constraints

- **POSIX sh in `install.sh`** — no bash arrays, no `[[ ]]`, no process substitution. No `jq` dependency (parse JSON with `grep`+`sed`).
- **No new top-level CLI dependencies** unless the alternative is materially worse. Hidden secret prompt is implemented with `node:readline` raw-mode (no `@inquirer/password`).
- **`gh` is a hard requirement of the project** (already used by `zeno upgrade --list` to call `gh release list`); `zeno upgrade --pr <N>` may shell out to `gh pr checkout`. `install.sh` may NOT depend on `gh` (operator has not run `zeno` yet).
- **Single PR, single feature branch (`feat/cli-ux-overhaul`)** — no flag-gated phased rollout. Quality gate (lint + typecheck + tests) must pass before merge.
- **Vault docs in English** (project rule).
- **No real identifiers** in any committed file (Constitution + sanitization rule).

## User Stories / Scenarios

1. **Operator with one profile, no sticky** runs `zeno connector list` → picker shows the only profile, hint reads `tip: zeno profile use <name> → skip picker next time`. Operator hits Enter, list renders. Next time without sticky still shows hint; with sticky, no picker.
2. **Operator running multiple profiles** runs `zeno connector secret set` → picker for profile, then picker for connector, then picker for secret key, then hidden prompt for value. No echoes.
3. **AI agent in CI** runs `zeno connector install --profile work --secret KEY=val playwright` → no prompt, install proceeds, exits 0.
4. **AI agent in CI** runs `zeno connector list` (no `--profile`, no sticky, no TTY) → exits 1 with `error: no profile specified. use --profile <name>`.
5. **Operator wants to test an open PR** runs `zeno upgrade --pr 123` → confirmation `pr target may break. continue? (y/N)`, then `gh pr checkout 123`, install/build pipeline, `setVersion(pr:123@<sha>)`, `writeMeta(pr:123@<sha>)`. `zeno --version` then prints `pr:#123 (a1b2c3d)`.
6. **Operator on first install via `curl ... | sh`** with no flags → installer fetches `releases/latest` from GitHub REST API, falls back to most recent prerelease if none, falls back to `main` if no releases at all. Writes `.installed-from` accordingly.
7. **Operator runs `zeno upgrade --branch feat/foo`** and the docker build fails → CLI catches, runs `git checkout <prev_value>`, restores `setVersion(prev)`, prints `✗ buildImage failed: ... ✓ reverted to <prev>` and exits 1. `zeno --version` matches the on-disk state.
8. **Operator runs `zeno status`** → single screen with profiles + container state + connector counts + last cron + last error. Stopped profiles show `stopped`; profiles whose API times out show `?`.
9. **Operator tries `zeno connector install playwright` when playwright is already installed** → CLI prints `playwright already installed (single-instance) → uninstall first: zeno connector uninstall playwright` and exits 1, instead of a raw `409` status.
10. **Operator pipes output for an agent**: `zeno profile list --json --quiet` → JSON array on stdout, no spinner, no headers, no colors.

## Acceptance Criteria

### A — Security / correctness

- [ ] **A1** Running `zeno connector install --profile fn linear` (without `--secret`) prompts `__MCP_AUTHORIZATION__:` and accepts up to 256 characters typed; the typed characters do NOT appear on the terminal at any point during typing or after Enter.
- [ ] **A1** `zeno connector secret set --profile fn linear-acme __MCP_AUTHORIZATION__` and `zeno connector secret rotate --profile fn linear-acme` use the same hidden prompt; verified by automated test that mocks `process.stdin` raw-mode and asserts no write to `process.stdout` other than the label.
- [ ] **A2** `compareSemver('v2026.5.10', 'v2026.5.9')` returns a positive number (newer); `compareSemver('v2026.5.9', 'v2026.5.10')` returns negative; `compareSemver('v2026.5.9-1', 'v2026.5.9')` returns positive.
- [ ] **A2** `zeno upgrade --to v2026.5.9` from `v2026.5.10` requires `--force` and prints `downgrade v2026.5.10 → v2026.5.9 requires --force`.
- [ ] **A3** A failed `buildImage` step during `zeno upgrade --to <new_tag>` leaves the working tree on `<prev_tag>`, `state.db` reporting `<prev_tag>`, and `.installed-from` containing the previous `kind:value@sha`. Verified by automated test that injects a failing `buildImage` and asserts post-run state.
- [ ] **A3** During the same failed run, the CLI prints `✗ buildImage failed: ...` followed by `✓ reverted to <prev_display>` and exits 1.
- [ ] **A4** Fresh `curl -fsSL ... | sh` with no flags clones the tag returned by `GET /repos/ribeirogab/zeno-agent/releases/latest`, NOT `main`. Verified by smoke test in CI that asserts `git -C ~/.zeno/zeno-agent describe --tags --exact-match` matches the API response.

### B — install.sh flag overhaul

- [ ] **B1** `install.sh --unstable` clones `main` (depth 1) and writes `unstable:@<sha>` to `.installed-from`.
- [ ] **B2** `install.sh --version v2026.5.7` validates the tag exists via REST (`GET /releases/tags/v2026.5.7`), then clones it (depth 1, `--branch v2026.5.7`), writes `tag:v2026.5.7@<sha>`. Invalid tag → `error: version v0.0.0 not found` and exit 1.
- [ ] **B3** `install.sh --branch feat/foo` clones depth 1 with `--branch feat/foo`, writes `branch:feat/foo@<sha>`.
- [ ] **B4** `install.sh --pr 123` clones `main` depth 1, fetches `pull/123/head:pr-123`, checks out `pr-123`, writes `pr:123@<sha>`. Works for fork PRs (verified manually with a PR from a fork).
- [ ] **B5** Default (no flag) tries `releases/latest` → falls back to `releases?per_page=1` (most recent prerelease) → falls back to `main`. Each fallback is reachable in tests by mocking the REST endpoint to return 404. **`zeno upgrade` (no flags, non-TTY) follows the same fallback chain via `pickLatestStable` in `lib/upgrade.ts` so installer and upgrader behave identically when both lack TTY.**
- [ ] **B6** Two target flags together (`install.sh --unstable --branch foo`) prints `error: --unstable and --branch are mutually exclusive` and exits 1.
- [ ] **B7** All flag paths run `pnpm install --frozen-lockfile` after clone (no relaxation).
- [ ] **B8** `.installed-from` content matches the format `(tag|branch|pr|unstable):<value>@<short-sha>` after every successful run.
- [ ] **B9** README and `apps/docs/content/docs/install.mdx` document the new flags. The string `--beta` does not appear anywhere in `install.sh`, `README.md`, or `apps/docs/content/docs/`.

### C — `zeno upgrade` parity

- [ ] **C1** `zeno upgrade --edge` (without alias) returns `Unknown flag: --edge`. `zeno upgrade --unstable` works.
- [ ] **C2** `zeno upgrade --branch feat/foo` runs `git fetch origin feat/foo` + checkout, writes `branch:feat/foo@<sha>` to `.installed-from` and `state.db`.
- [ ] **C3** `zeno upgrade --pr 123` runs `gh pr checkout 123`, writes `pr:123@<sha>`. Fails with a clear message if `gh` is missing or the user is unauthenticated.
- [ ] **C4** `zeno --version` displays `v2026.5.7`, `branch:feat/foo (a1b2c3d)`, `pr:#123 (a1b2c3d)`, or `unstable (a1b2c3d)` according to current `.installed-from`.
- [ ] **C5** Two target flags together (`--unstable --branch foo`) → `error: --unstable and --branch are mutually exclusive`, exit 1.
- [ ] **C6** `zeno upgrade --unstable`, `zeno upgrade --branch <name>`, and `zeno upgrade --pr <number>` in TTY each show a confirmation prompt of the form `<kind> target may break. continue? (y/N)`. Adding `--yes` skips the prompt. In non-TTY without `--yes` → exits 1 with `error: --<kind> requires --yes in non-interactive mode`.
- [ ] **C7** `zeno upgrade --branch foo --dry-run` prints the resolved target and the seven pipeline steps (`fetchTags`, `checkoutRef`, `setVersion`, `writeMeta`, `installDeps`, `buildCli`, `buildImage`) without running any of them; exits 0 without touching git, DB, `.installed-from`, or building anything. The seven steps match the new `upgradeSteps` structure described in Q5.
- [ ] **C8** `zeno upgrade --list` returns 30 releases by default; `--limit 10` returns 10. `apps/cli/src/lib/upgrade.ts:32` no longer hardcodes `--limit 10`.
- [ ] **C9** `zeno upgrade` (no flags) opens the picker with the cursor on the latest stable release row, not on `current`. Current is marked with `*` in the row.
- [ ] **C10** The picker displays an `unstable` row separated from releases by a horizontal rule; the `unstable` label is colored to stand out (e.g. yellow).
- [ ] **C11** `zeno upgrade --notes <tag>` prints the release body via `gh release view <tag>` and exits 0 without performing any upgrade. The picker also shows a key hint `n: notes` when on a release row.
- [ ] **C12** `zeno upgrade --help` lists every flag: `--to`, `--latest`, `--prerelease`, `--unstable`, `--branch`, `--pr`, `--list`, `--force`, `--dry-run`, `--yes`, `--limit`, `--notes`.

### D — Picker fallback

- [ ] **D1** No file under `apps/cli/src/commands/` contains the literal string `args.profile ?? 'default'`. Every command resolves profile via `resolveProfile(args.profile)` from `lib/resolvers.ts`.
- [ ] **D2** `zeno profile use` (no arg, TTY) opens a picker over all profiles, marks the current sticky with `*`, returns 0 after selection. `zeno profile use` (no arg, non-TTY) exits 1 with `usage: zeno profile use <name>`.
- [ ] **D3** `zeno start` / `stop` / `restart` / `logs` / `open` (no arg, no sticky, TTY) open a picker over profiles with live container state. With `--all`, no picker. With sticky set, no picker.
- [ ] **D4** `zeno connector list` (no arg, TTY, no sticky, ≥2 profiles) opens picker. After selection, prints `tip: zeno profile use <name> → skip picker next time`. With `--quiet`, no tip.
- [ ] **D5** `zeno connector show` (no slug, TTY) opens picker over `GET /api/connectors`, then runs show with the chosen slug.
- [ ] **D6** `zeno connector install` (no catalog id, TTY) opens picker over `GET /api/connectors/catalog`, then runs install with the chosen id.
- [ ] **D7** `zeno connector secret set` (no key, TTY) opens picker over the connector's secret keys, then runs the hidden prompt for the value.
- [ ] **D8** `zeno connector tool set` (no tool or no permission, TTY) opens picker for each missing arg.
- [ ] **D9** Every command that opens a picker also accepts the equivalent flag/positional and skips the picker when provided.
- [ ] **D10** All pickers reuse `apps/cli/src/lib/picker.ts`; no second picker library is introduced.

### E — UX polish

- [ ] **E1** `zeno status` exists as a top-level subcommand. Default output renders profiles + container state + connector count + last cron + last error in a single screen. Stopped profiles render `stopped` for their HTTP-derived fields. A profile whose API does not respond within 1s renders `?`.
- [ ] **E1** `zeno status --json` returns a JSON array, one object per profile, with fields `name`, `port`, `state`, `uptimeMs`, `connectorCount`, `lastCron`, `lastError`. Schema documented in `apps/docs/content/docs/cli.mdx`.
- [ ] **E2** `zeno profile delete <name>` (TTY, no `--yes`) prompts `delete profile '<name>'? this destroys volumes and data. (y/N)`. With `--yes`, no prompt. **The current type-name-to-confirm pattern in `apps/cli/src/commands/profile-delete.ts` (`Type '<name>' to confirm:`) is replaced by this `(y/N)` pattern; the old prompt and its parsing logic are removed.**
- [ ] **E2** `zeno connector uninstall <slug>` (TTY, no `--yes`) prompts `uninstall connector '<slug>'? (y/N)`. With `--yes`, no prompt.
- [ ] **E2** `zeno connector app uninstall` (TTY, no `--yes`) prompts `uninstall app '<App Name>'? this cascades to N installations. (y/N)`. With `--yes`, no prompt. **The current `--confirm "<App Name>"` flag and its case-sensitive verification (currently in `apps/cli/src/commands/connector-app-uninstall.ts`) are removed; `400 confirm_app_name_mismatch` no longer needs to be returned by the API.**
- [ ] **E2** Any destructive op without `--yes` in non-TTY exits 1 with `error: destructive operation requires --yes in non-interactive mode`.
- [ ] **E3** When the API returns `409 single_instance_catalog_already_installed`, the CLI prints `<catalog> already installed (single-instance)` and a `→ uninstall first: zeno connector uninstall <slug>` hint, exiting 1. Verified by mocking the API response in unit test.
- [ ] **E3** `apps/cli/src/lib/errors.ts` exports `friendly(e: ApiError): { msg: string; hint?: string }` and a `runCommand(fn)` helper that wraps the print + exit logic.
- [ ] **E4** Every read command (`profile list/show`, `connector list/show/catalog`, `connector secret list`, `connector tool list`, `status`) accepts `--json`.
- [ ] **E4** Every command accepts `--quiet`. With `--quiet`: spinners are silent, headers/dividers omitted, colors stripped (`NO_COLOR` semantics), `info(...)` calls suppressed, `err(...)` still prints.
- [ ] **E4** A command run with `--json --quiet` produces stdout that is parseable JSON with no leading/trailing decoration; verified by `JSON.parse(stdout)` in test.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Refactoring 20+ connector commands to use `resolveProfile` introduces regressions in flag handling | Each command has its own vitest unit test under `apps/cli/tests/commands/`; refactor module-by-module and keep tests green throughout |
| `gh pr checkout` failing in `zeno upgrade --pr` for unauthenticated users | Detect early: `gh auth status` before checkout; fail with `gh is unauthenticated; run 'gh auth login'` |
| `install.sh` REST fallbacks (latest → prerelease → main) become hard to test in CI | Smoke test mocks the GitHub REST endpoint with `curl`-replacement (env-injected base URL) and runs each fallback path |
| Hidden secret prompt breaks paste flow (multi-char paste arrives as single `data` event) | Implementation accumulates incoming data per event without emitting per char; verified via test that pastes a 64-char string in a single buffer write |
| Auto-revert in `zeno upgrade` itself fails (e.g. previous tag was deleted from origin) | Auto-revert wraps in try/catch; on failure, prints `✗ revert failed: <reason>` and instructs operator to run `zeno upgrade --to <prev>` manually |
| `zeno status` HTTP fan-out adds 200–500ms even when all profiles are healthy | Per-profile timeout (1s) + parallel via `Promise.allSettled`; document in `cli.mdx` that `status` is not a real-time monitor |
| Removing `--beta` and `--edge` breaks operators following older guides | Document the rename in `ROADMAP.md` "Recently shipped" entry; the next `zeno upgrade` itself will surface the new flag set in `--help` |
| Picker reuse across many call sites concentrates risk in `lib/picker.ts` | Already battle-tested by `zeno upgrade`; expand its test coverage as part of D10 |
| `--json` schemas drift over time without an envelope to absorb changes | Documented schemas + manual release notes; revisit envelope when first external integrator appears |

## Open Questions

None at spec time. All design decisions are locked in the Q&A above.
