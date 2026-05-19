---
feature: connector-github
plan: "[[plan-connector-github]]"
spec: "[[spec-connector-github]]"
created: 2026-04-27
---
# GitHub Connector — Tasks

**For this plan:** `[[plan-connector-github]]`

## Phase 0 — Spec finalization

- [x] Author docs.
- [x] R1 / R2 (cross-check vs `app-auth.ts` + `catalog-loader.ts` + `connectors.ts` + Dockerfile patterns) / R3. Cleared after multiple rounds.
- [x] Front-matter `status: approved`.

## Phase 1 — Dockerfile + Go binary + 0039 prereq gate

> **GATE: Phases 2.2 onward are BLOCKED until spec 0039's regenerator patch (throw → warn+continue on missing env) has shipped. Run Task 1.0 first.**

### Task 1.0: Verify spec 0039's regenerator patch is present

- [ ] `grep -n "skip.*: missing env var" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` should match a `console.warn(...)` line.
- [ ] If grep returns nothing, spec 0039 has not shipped — STOP. Phase 2.2 will abort otherwise on the first non-GitHub entry with a missing token.

### Task 1.1: Add Go build stage for `github-mcp-server`

- [ ] Edit `infra/Dockerfile`. Insert a new build stage **before** the `runtime` stage (after `builder`):
  ```dockerfile
  # Spec 0042: build the GitHub MCP Go binary; copied into runtime below.
  FROM golang:1.22 AS gh-mcp-builder
  RUN go install github.com/github/github-mcp-server/cmd/github-mcp-server@v0.5.0
  ```
- [ ] Verify `v0.5.0` is a real release tag at https://github.com/github/github-mcp-server/releases. If newer is available and stable, prefer pinning the latest stable tag.

### Task 1.2: Copy binary into runtime stage

- [ ] Insertion point: in the existing `runtime` stage of `infra/Dockerfile`, AFTER `COPY package.json pnpm-workspace.yaml ./` (line 67 today) and BEFORE `RUN mkdir -p /workspace && chown -R node:node /workspace /app` (line 70). The COPY must run while the stage is still root — line 74 (`USER node`) is the last point before the user switch.
  ```dockerfile
  # Spec 0042: copy github-mcp-server binary built in the gh-mcp-builder stage.
  COPY --from=gh-mcp-builder /go/bin/github-mcp-server /usr/local/bin/
  ```
- [ ] Resulting binary: `/usr/local/bin/github-mcp-server`, owned by root (default for COPY). On both root's and node's `PATH`, executable for both.

### Task 1.3: Verify build

- [ ] `pnpm run docker:build` succeeds.
- [ ] `docker run --rm zeno-agent:dev github-mcp-server --version` prints a version starting with `v0.5`.
- [ ] `docker run --rm --user node zeno-agent:dev github-mcp-server --version` also works.

### Task 1.4: Install `github-mcp-server` on the host (for Phase 2.2 regenerator)

> **Why on host**: Phase 2.2 runs the regenerator on the host (catalog file is bind-mounted read-only into the container; `apps/` not mounted; same constraint as 0040/0041 documented). The host therefore needs `github-mcp-server` on its PATH for the regenerator to spawn it.

- [ ] If `which github-mcp-server` returns nothing on the host: download the prebuilt binary from https://github.com/github/github-mcp-server/releases/tag/v0.5.0 for your OS/arch, put it on PATH (e.g., `~/.local/bin`).
- [ ] Alternative (if Go is on host): `go install github.com/github/github-mcp-server/cmd/github-mcp-server@v0.5.0` — installs to `~/go/bin`.
- [ ] Verify: `github-mcp-server --version` prints `v0.5.x`.

## Phase 2 — GitHub Personal connector

### Task 2.1: Catalog entry

- [ ] Append `github` to `agent/connectors-catalog.json` (alphabetical position: `github` < `klaviyo` < `linear` < `sentry` < `swarmia`, so `github` goes first if 0039+0040+0041 land first):
  ```json
  {
    "id": "github",
    "name": "GitHub Personal",
    "description": "GitHub access via a personal access token. Issues, PRs, repos, code search.",
    "icon": "github.svg",
    "docsUrl": "https://github.com/github/github-mcp-server",
    "transport": "stdio",
    "transportConfig": { "command": "github-mcp-server", "args": ["stdio"] },
    "authCheckTool": "get_me",
    "secrets": [{
      "key": "GITHUB_PERSONAL_ACCESS_TOKEN",
      "label": "Personal Access Token",
      "help": "GitHub PAT with at least repo + read:org. Get one at github.com/settings/tokens.",
      "required": true
    }],
    "tools": [],
    "tags": ["development", "code"]
  }
  ```
- [ ] **Important**: do NOT include `inputType` in this entry yet — the schema extension that adds `inputType` lands in Phase 3. The default install modal already renders password-style inputs by default, so the Personal flow works without it. Adding `inputType` to the entry before the schema accepts it would fail Zod validation at catalog load time.

### Task 2.2: Tool list regeneration

> **Execution context**: runs on the host. Host needs `github-mcp-server` from Task 1.4. Catalog file is bind-mounted read-only; can't write from inside the container.

- [ ] On the host: `GITHUB_PERSONAL_ACCESS_TOKEN=<real PAT> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp`
- [ ] Output expectation: each entry without an env var present logs `skip <id>: missing env var <NAME>` (warning, not error). Github logs `fetching tools from live MCP for github...` and `github: <N> tools updated`.
- [ ] Confirm 30+ tools. Snapshot in lockstep.
- [ ] **Caveat**: regen does NOT call `authCheckTool` (`get_me`) — only `tools/list`. Real auth validation happens in Task 2.5 via `POST /catalog/github/test`, which DOES pass `authCheckTool` per spec 0038 F#2.

### Task 2.3: Brand icon

- [ ] Save GitHub mark SVG (Octocat) to `agent/assets/connectors/github.svg`. Source: GitHub's brand assets (`https://github.githubassets.com/favicons/favicon.svg` or download the official Octocat SVG from github.com/logos).

### Task 2.4: Quality gate

- [ ] `pnpm -w run quality-gate` green.

### Task 2.5: Manual smoke (Personal)

- [ ] `pnpm run docker:build` + `PROFILE=<your-profile> pnpm run docker:up`.
- [ ] API bad token: `POST /api/connectors/catalog/github/test` with `Bearer ghp_INVALID` → `{ok: false, errorKind: 'auth'}`.
- [ ] API real token → `{ok: true, tools: [<30+>]}`.
- [ ] UI install at `http://localhost:3001/connectors` (port 3001 is the example mapping in `infra/docker-compose.<profile>.yml` for non-default profiles).
- [ ] Send DM to the operator's Slack DM channel: `[smoke gh-personal] list 5 open issues in your-github-username/zeno-agent`.
- [ ] Wait ≤90s. Verify reply contains structured issue data.
- [ ] DB: `connector_invocations` row with `tool_name='mcp__github__list_issues'` (or similar) and `result='ok'`.

## Phase 3 — Catalog schema extension

### Task 3.1: Add `inputType` to secret schema

- [ ] Edit `apps/api/src/lib/catalog-loader.ts`:
  ```ts
  export const catalogSecretSchema = z.object({
    key: z.string(),
    label: z.string(),
    help: z.string(),
    required: z.boolean(),
    inputType: z.enum(['text', 'password', 'pem']).optional(),
  });
  ```

### Task 3.2: Add `customInstallComponent` to entry schema

- [ ] Edit same file:
  ```ts
  export const catalogEntrySchema = z.object({
    // ... existing fields
    customInstallComponent: z.string().optional(),
    // ...
  });
  ```

### Task 3.3: Default modal renders inputType

- [ ] Edit `apps/dashboard/src/components/connectors/catalog-install-modal.tsx`:
  - `inputType=password` (default) → existing `<input type="password">`.
  - `inputType=text` → `<input type="text">` (no masking).
  - `inputType=pem` → `<textarea>` + `<input type="file">` that loads the file content into the textarea.

### Task 3.4: Quality gate

## Phase 4 — Custom install modal registry

### Task 4.1: Create registry

- [ ] `apps/dashboard/src/components/connectors/install-modals/registry.ts` with a Record-of-components.

### Task 4.2: Wire registry in catalog-install-modal

- [ ] Before rendering default fields, check `entry.customInstallComponent`. If set + present in registry, render that component (passing `entry` + `onClose` props). Else default.

### Task 4.3: Placeholder GitHubAppInstallModal

- [ ] `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx` — minimal scaffold to verify the registry routing works.

## Phase 5 — GitHub App connector

### Task 5.1: Catalog entry `github-app`

- [ ] Append per plan §Phase 5 with `customInstallComponent: 'github-app'`.

### Task 5.2: Custom install modal — full UI

- [ ] `app_id` text input.
- [ ] PEM file picker (validates `-----BEGIN RSA PRIVATE KEY-----`).
- [ ] Installations editor: list of rows, each with `name`, `id`, `env_var`. Add/remove rows.
- [ ] Test button calls a new API endpoint that validates the JWT signing + mints test tokens for each installation.
- [ ] Add button submits payload.

### Task 5.3: API endpoint for App install

- [ ] Decide: extend existing `POST /api/connectors` with a new `source: 'github-app'` discriminator OR add a dedicated `POST /api/connectors/install/github-app`.
- [ ] Implementation: accepts `{appId, pem, installations: [{name, id, envVar}]}`, validates each installation by minting a test token, then in one transaction creates N connector rows with reserved-key secrets (`__GITHUB_APP_ID__`, `__GITHUB_APP_PEM__`, `__GITHUB_INSTALLATION_ID__`, `__GITHUB_INSTALLATION_NAME__`, `__GITHUB_ENV_VAR__`).
- [ ] **Slug derivation rule (must lowercase)**: the connector slug for each installation is `github-app-` + the installation name lowercased + non-alphanumeric/hyphen chars replaced with `-` (collapse adjacent hyphens, trim leading/trailing). Examples:
  - `AcmeBooks` → `github-app-acmebooks`
  - `AcmeShop` → `github-app-acmeshop`
  - `Acme-OMS` → `github-app-acme-oms`
  - `acme-support` → `github-app-acme-support`
- [ ] Why lowercase: the slug becomes the connector's `id`-equivalent visible in tool names (`mcp__<slug>__<tool>`); the `catalogEntrySchema.id` regex `/^[a-z0-9][a-z0-9-]*$/` (`apps/api/src/lib/catalog-loader.ts:32`) is lowercase-only. Tool names also need to be lowercase for consistent always_sensitive matching (Task 7.4).

### Task 5.4: Worker `app-auth.ts` reads from DB

- [ ] Refactor `loadGitHubAppConfig(connectorRepo)`: query connectors where `slug LIKE 'github-app-%'`, group by appId (read from `__GITHUB_APP_ID__` secret), build a `GitHubAppAuth` instance per app.
- [ ] The PEM content lives in the `__GITHUB_APP_PEM__` secret (not a file path anymore). Refactor `GitHubAppAuth` constructor to accept `privateKey: string` directly instead of `privateKeyPath: string` (currently it reads the file via `readFileSync`). Backward compat: keep `privateKeyPath` optional and fall back to file read if `privateKey` not provided.
- [ ] Each connector still produces a `<ORG>_GH_TOKEN`-style env var at bootstrap time, sourced from the `__GITHUB_INSTALLATION_NAME__`/`__GITHUB_INSTALLATION_ID__` secrets and the connector's mapping to its env var name. The env var name comes from a fifth reserved key `__GITHUB_ENV_VAR__` (e.g., `ACME_GH_TOKEN`) — add this to the reserved-keys list of secrets stored per github-app connector.

### Task 5.4b: `mcp-build.ts` intercepts `github-app-*` connectors before `toStdioConfig`

- [ ] **Architectural constraint**: `buildMcpServersMap` MUST stay synchronous — the SDK's `mcpServers` getter contract (`apps/worker/src/agent/backends/claude-code.ts:45,255`) is `() => Record<string, McpServerConfig>` (sync), and `getMcpServers` is called synchronously inside `ClaudeCodeBackend.buildMcpServers()`. Making it async would break the contract and require deeper refactoring of the backend types.
- [ ] **Sync-token strategy**: add a new `getCachedToken(installationName: string): string | null` method to `GitHubAppAuth` that returns the cached token IF still valid (within margin), otherwise returns `null`. No fetch, no `await`. The existing `bootstrap()` + interval refresh (55-min timer in `app-auth.ts:43-45`, well under the 60-min token TTL) keeps the cache fresh.
- [ ] Edit `apps/worker/src/agent/mcp-build.ts`. In the `for (const { connector, secrets } of userLayer)` loop, when `connector.slug.startsWith('github-app-')`:
  1. Read the FIVE reserved keys from the connector's `secrets`: `__GITHUB_APP_ID__`, `__GITHUB_APP_PEM__`, `__GITHUB_INSTALLATION_ID__`, `__GITHUB_INSTALLATION_NAME__`, and `__GITHUB_ENV_VAR__`. (Same five keys persisted by Task 5.3 and asserted by Task 5.6's DB query.)
  2. Read the installation name from the secret. Get a cached token via `appAuth.getCachedToken(installationName)`.
  3. If `null` (cache miss / stale), use the existing error-path: log a `connector_skipped` warning, persist `last_error: 'github app token cache miss'`, skip this connector for the turn. The next turn (after the timer refresh) will succeed.
  4. If valid token, synthesize a single secret `{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: <token> }`.
  5. Pass `[synthSecret]` (NOT the original secrets array) to `toStdioConfig`. This guarantees the five `__GITHUB_*__` secrets are NEVER forwarded as env vars to the `github-mcp-server` subprocess — only the synthesized PAT is.
- [ ] Why this lives in `mcp-build.ts` rather than `toStdioConfig`: the github-app-specific logic (cached-token lookup, app-auth instance reference) shouldn't pollute the generic `build-config.ts`. The worker is the authoritative place for connector-type dispatch.

### Task 5.4c: Where `app_id` lives today (for migration)

- [ ] **Source of truth for `app_id` value to enter in the dashboard**: `agent/config.yaml` line 2 (`github_app.app_id: "12345"`). This value moves to the DB as `__GITHUB_APP_ID__` secret on each per-installation connector row when the user installs via dashboard. After migration (Phase 7), the agent-layer yaml's `github_app.app_id` is removed (along with `github_app.private_key_file`); only `github_app.git_identity` may remain — see Task 7.4 for the git_identity preservation strategy.

### Task 5.5: Connector cache invalidation on update

- [ ] When `connector_update` handler runs and the connector slug starts with `github-app-`, invalidate the in-memory token cache for that installation.

### Task 5.6: Smoke per-installation

- [ ] `pnpm run docker:build` + redeploy.
- [ ] UI install at `http://localhost:3001/connectors`: open the GitHub App card, paste `app_id`, upload `.pem`, add 4 installations (e.g., AcmeBooks, AcmeShop, Acme-OMS, acme-support) with their respective installation IDs and env var names from the existing yaml. Click Test → expect 4 successful probes (one per installation).
- [ ] Click Add → 4 connector rows appear in the installed section, slugs `github-app-acmebooks`, `github-app-acmeshop`, `github-app-acme-oms`, `github-app-acme-support`.
- [ ] DB: `SELECT slug, status FROM connectors WHERE slug LIKE 'github-app-%'` returns 4 rows. `SELECT key FROM connector_secrets WHERE connector_id IN (SELECT id FROM connectors WHERE slug LIKE 'github-app-%') GROUP BY key` returns the 5 reserved keys (`__GITHUB_APP_ID__`, `__GITHUB_APP_PEM__`, `__GITHUB_INSTALLATION_ID__`, `__GITHUB_INSTALLATION_NAME__`, `__GITHUB_ENV_VAR__`).
- [ ] Each connector's tools[] populated by refresh-tools.
- [ ] Send DM to the operator's Slack DM channel: `[smoke github-app] list 3 open PRs in AcmeBooks/ecomm`.
- [ ] Wait ≤90s. Verify reply contains structured PR data and `connector_invocations` has a row with `tool_name='mcp__github-app-acmebooks__list_pull_requests'` (or whatever name regen produced) and `result='ok'`.

## Phase 7 — Migration of yaml + .pem

### Task 7.1: Move legacy files

- [ ] `mkdir -p tmp/legacy-github-app`.
- [ ] `mv profiles/<your-profile>/skills/<owner>/github-app.pem tmp/legacy-github-app/github-app.pem`.
- [ ] `mv profiles/<your-profile>/skills/<owner>/github.md tmp/legacy-github-app/github.md` (informational doc; the active SKILL.md remains in place).
- [ ] Add `tmp/legacy-github-app/README.md` with origin info: where each file came from, the date moved, the spec ID (0042), and a note that the same data now lives in the DB via dashboard.

### Task 7.2: Remove yaml blocks

- [ ] Edit `profiles/<your-profile>/config.yaml`: remove the entire `github_app:` block (lines 11-26 today, including `private_key_file` and `installations`). Note: `private_key_file` only exists in the profile layer — the agent layer doesn't have it, so the agent edit below is `app_id`-only.
- [ ] Edit `agent/config.yaml`: remove `github_app.app_id`. Keep `github_app.git_identity` for now (Task 7.3 moves it elsewhere).

### Task 7.3: Preserve `git_identity` (independent of github_app config)

- [ ] `git_identity` is currently nested under `github_app.git_identity` in `agent/config.yaml` and is read by `apps/worker/src/github/git-identity.ts:parseGitIdentityFromConfig` (lines 22-28). It's used to set `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` for skill commits — it has nothing to do with the App config that's moving to DB.
- [ ] Two options to preserve git_identity through the github_app block removal:
  - **Option A (preferred)**: Keep `agent/config.yaml`'s `github_app: { git_identity: ... }` block as a leftover (just the git_identity sub-field). `parseGitIdentityFromConfig` already handles this case. Pro: zero code change. Con: `app-auth.ts` will see a partial `github_app` block at boot and may log a "config_incomplete" warning (line 202-205); refactor `loadGitHubAppConfig` to skip the warning when only `git_identity` is present in agent layer.
  - **Option B**: Move `git_identity` to a top-level key in `agent/config.yaml` (e.g., `git_identity: { name, email }`) and update `parseGitIdentityFromConfig` to read top-level first, falling back to `github_app.git_identity` for back-compat.
- [ ] **Decision**: Option B (cleaner separation of concerns; same effort). Edit:
  1. `agent/config.yaml`: move `git_identity` from under `github_app:` to top level.
  2. `apps/worker/src/github/git-identity.ts:parseGitIdentityFromConfig`: read `parsed?.git_identity` first; fall back to `parsed?.github_app?.git_identity` for back-compat (in case any other profile's yaml still has the nested shape).

### Task 7.4: Update `always_sensitive` for App per-installation tools

- [ ] Edit `profiles/<your-profile>/config.yaml` `approvals.always_sensitive` list. The current entry `mcp__github__merge_pull_request` only catches the Personal connector. Add per-installation entries for the App connectors:
  ```yaml
  always_sensitive:
    - mcp__github__merge_pull_request
    - mcp__github-app-acmebooks__merge_pull_request
    - mcp__github-app-acmeshop__merge_pull_request
    - mcp__github-app-acme-oms__merge_pull_request
    - mcp__github-app-acme-support__merge_pull_request
  ```
- [ ] Why explicit (not wildcard): `makeAlwaysSensitivePolicy` (`apps/worker/src/guardrails/policies/always-sensitive.ts:17`) supports `prefix*` (suffix wildcards only via `endsWith('*')` + `startsWith`). A pattern like `mcp__github-app-*__merge_pull_request` does NOT match — middle wildcards aren't supported. Listing each installation explicitly is the working path.

### Task 7.5: Verify migration

- [ ] Restart worker. `gh` CLI still works (env vars like `<ORG_A>_GH_TOKEN`, `<ORG_B>_GH_TOKEN`, etc. still set from DB-sourced config).
- [ ] Send DM to the operator's Slack DM channel: a `gh`-CLI-using question (e.g., "use a code-review skill to look at the latest commit on main"). Verify the agent uses `gh` CLI and returns expected data — confirming env vars are still being set by the worker boot from DB sourcing.

## Phase 8 — `merge_pull_request` sensitive verification

### Task 8.1: Smoke

- [ ] Send DM to the operator's Slack DM channel: `[smoke gh-app sensitive] please merge PR #<low-impact PR number> in <org>/<repo>` (pick a real PR you control and can re-create if accidentally merged).
- [ ] Expected: agent does NOT auto-merge; classifier_gate routes to approver (or the policy chain blocks at `always_sensitive`). Slack message from approver flow appears.
- [ ] DB: `approvals_log` row with `tool_name='mcp__github-app-<org-slug>__merge_pull_request'` and `policy_that_gated='always_sensitive'`.
- [ ] If the agent did auto-merge: STOP. Add the missing per-installation explicit entry to `profile/config.yaml`'s `approvals.always_sensitive` list. Do NOT use `mcp__github-app-*__merge_pull_request` — the policy at `apps/worker/src/guardrails/policies/always-sensitive.ts:17` only supports SUFFIX wildcards (`pattern.endsWith('*')` + `startsWith` match), so a middle-wildcard pattern would not match. Document the fix as a learning + revert the merge.

## Phase 9 — Close

### Task 9.1: Spec status

- [ ] `spec.md` front-matter `status: shipped`, `shipped: <date>`.

### Task 9.2: Commit on a feature branch + open PR (with explicit user authorization)

- [ ] Create a feature branch (e.g., `feat/connector-github`) and commit with a detailed message there. This spec is large; consider splitting into multiple commits per phase (Personal → Schema/UI → App → Migration). Do NOT commit directly on main — per global CLAUDE.md.
- [ ] Wait for explicit user authorization to push the branch.
- [ ] Open a PR using `/open-pr` (project-required command).
- [ ] Wait for explicit user authorization before merging into main.

## Definition of Done

- 3 clean reviews.
- Personal flow shipped.
- App flow shipped — 4 installations work, tokens refresh.
- yaml + .pem moved to `tmp/legacy-github-app/`.
- `gh` CLI still works.
- `merge_pull_request` still sensitive.
- Quality gate green.
