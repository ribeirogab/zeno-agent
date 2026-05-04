---
feature: connector-github
spec: "[[spec-connector-github]]"
created: 2026-04-27
---
# GitHub Connector — Plan

**For this spec:** `[[spec-connector-github]]`

## Approach

Phased: ship Personal first (small, validates the Go binary + MCP path), then Personal proves out, then build the App flow's heavier infra (catalog schema extension + custom UI registry + per-installation row creation + DB-backed app config).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ infra/Dockerfile                                                │
│   build stage: golang:1.22                                      │
│     go install github.com/github/github-mcp-server/...@v0.5.0  │
│   runtime stage: copy binary → /usr/local/bin/                 │
└─────────────────────────────────────────────────────────────────┘

GitHub Personal:
┌─────────────────────────────────────────────────────────────────┐
│ Catalog: github                                                 │
│   transport: stdio                                              │
│   command: github-mcp-server, args: ["stdio"]                  │
│   secrets: [GITHUB_PERSONAL_ACCESS_TOKEN]                       │
│   authCheckTool: get_me                                         │
│ → Standard install modal                                        │
│ → One DB row, normal flow                                       │
└─────────────────────────────────────────────────────────────────┘

GitHub App:
┌─────────────────────────────────────────────────────────────────┐
│ Catalog: github-app                                             │
│   transport: stdio                                              │
│   command: github-mcp-server, args: ["stdio"]                  │
│   customInstallComponent: github-app                            │
│   secrets: (composite — handled by custom UI)                   │
│   authCheckTool: get_me                                         │
│ → Custom install modal:                                         │
│     - app_id text field                                         │
│     - PEM file upload (inputType: pem)                          │
│     - installations editor (add/remove rows)                    │
│ → On Add, dashboard POSTs to API:                               │
│     - Creates app config record (1 row of secrets per           │
│       installation, slug = github-app-<inst-name>)              │
│     - Each connector spawns github-mcp-server with its          │
│       OWN env (GITHUB_PERSONAL_ACCESS_TOKEN minted at boot/turn)│
│                                                                 │
│ Worker boot:                                                    │
│   loadGitHubAppConfig() now reads from DB                       │
│   Mints installation tokens for each row                        │
│   Sets env vars (ACME_GH_TOKEN, etc.) for `gh` CLI              │
│   At MCP spawn time, freshes the installation token             │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

Files **created**:

- `agent/assets/connectors/github.svg` — brand icon (shared by both entries — same logo).
- `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx` — custom install component for App flow.
- `apps/dashboard/src/components/connectors/install-modals/registry.ts` — registry mapping catalog id → component.
- `tmp/legacy-github-app/` — destination for yaml + .pem after migration.

Files **modified**:

- `infra/Dockerfile` — Go build stage + binary copy into runtime.
- `agent/connectors-catalog.json` — append `github` and `github-app` entries.
- `apps/api/src/lib/catalog-loader.ts` — add `inputType` (optional) to `catalogSecretSchema`; add `customInstallComponent` (optional) to `catalogEntrySchema`.
- `apps/dashboard/src/components/connectors/catalog-install-modal.tsx` — when entry has `customInstallComponent`, render that component from the registry instead of the default secret-fields layout. Also: render `<input type="password">` for `inputType: password` (default), `<input type="text">` for text, and `<textarea>` + file picker for `pem`.
- `apps/api/src/routes/connectors.ts` — for the App flow, accept a richer install payload (app_id + pem + installations array); spawn N connector rows in one transaction (slugs derived from installation names).
- `apps/worker/src/github/app-auth.ts` — `loadGitHubAppConfig(connectorRepo)` reads from DB. Constructor accepts `privateKey: string` directly (with `privateKeyPath` fallback for back-compat).
- `apps/worker/src/agent/mcp-build.ts` — intercept `github-app-*` connectors BEFORE `toStdioConfig`; read cached installation token (sync, via new `GitHubAppAuth.getCachedToken`); synthesize a PAT-shaped secret. Stays synchronous (does NOT change the `() => Record<...>` getter contract used by `ClaudeCodeBackend`). Ensures the five `__GITHUB_*__` raw secrets (`__GITHUB_APP_ID__`, `__GITHUB_APP_PEM__`, `__GITHUB_INSTALLATION_ID__`, `__GITHUB_INSTALLATION_NAME__`, `__GITHUB_ENV_VAR__`) are never forwarded to the github-mcp-server subprocess.
- `apps/worker/src/index.ts` — pass `connectorRepo` to `loadGitHubAppConfig`; cache the resulting `GitHubAppAuth` instance for reuse by `mcp-build.ts`.
- `apps/worker/src/github/git-identity.ts` — `parseGitIdentityFromConfig` reads top-level `git_identity` first (with `github_app.git_identity` fallback for back-compat).
- `profiles/<your-profile>/config.yaml` — remove the `github_app:` block; expand `approvals.always_sensitive` list with per-installation merge entries.
- `agent/config.yaml` — remove `github_app.app_id` and `github_app.private_key_file`; move `github_app.git_identity` to a top-level `git_identity:` key.
- (move) `profiles/<your-profile>/skills/<owner>/github-app.pem` → `tmp/legacy-github-app/`.
- (move) `profiles/<your-profile>/skills/<owner>/github.md` → `tmp/legacy-github-app/`.

Files **NOT modified**:

- `packages/mcp-discover/` — no changes required (the github-app-specific intercept lives in worker's `mcp-build.ts`).
- `packages/storage/migrations` — no schema changes required.

## Phase ordering

### Phase 0 — Spec + 3 reviews

### Phase 1 — Prereq gate + Dockerfile + Go binary

**Pre-step (gate)**: verify spec 0039's regenerator patch is present (`grep "skip.*: missing env var" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` should match a `console.warn(...)` line). If not, merge 0039 first — Phase 2.2 will abort otherwise.

- Multi-stage. The new `gh-mcp-builder` stage is added BEFORE the existing `runtime` stage (Dockerfile order: `base`, `deps`, `builder`, `gh-mcp-builder`, `runtime`). The COPY in the `runtime` stage references it.
  ```
  # ... existing base/deps/builder stages (unchanged) ...

  # NEW: Go build stage for the GitHub MCP binary.
  FROM golang:1.22 AS gh-mcp-builder
  RUN go install github.com/github/github-mcp-server/cmd/github-mcp-server@v0.5.0

  # Existing runtime stage with one new COPY:
  FROM base AS runtime
  ENV NODE_ENV=production
  ... (existing COPY blocks for app dist) ...
  COPY package.json pnpm-workspace.yaml ./
  COPY --from=gh-mcp-builder /go/bin/github-mcp-server /usr/local/bin/
  RUN mkdir -p /workspace && chown -R node:node /workspace /app
  USER node
  ... (rest unchanged) ...
  ```
- The COPY lands while runtime is still root (before the `USER node` switch on line 74 of the current Dockerfile).
- Verify: `docker run --rm zeno-agent:dev github-mcp-server --version` and `docker run --rm --user node zeno-agent:dev github-mcp-server --version` both print `v0.5.x`.
- **Host install (for Phase 2.2)**: separately install `github-mcp-server` on the host (prebuilt binary from GitHub releases or `go install ...@v0.5.0`). The catalog file is bind-mounted read-only and `apps/` is not mounted, so the regenerator runs on the host and needs the binary on the host PATH.

### Phase 2 — GitHub Personal connector (catalog only)

- Catalog entry `github` (Personal). Standard install modal. `authCheckTool: 'get_me'`.
- Regenerator with PAT from env to populate tools[].
- Icon, quality gate, smoke (GP3/GP4/GP5/GP6).

### Phase 3 — Catalog schema extension

- Add `inputType: z.enum(['text', 'password', 'pem']).optional()` to `catalogSecretSchema`.
- Add `customInstallComponent: z.string().optional()` to `catalogEntrySchema`.
- Default modal: `inputType=password` keeps existing behavior; `inputType=pem` renders a `<textarea>` + file picker; `inputType=text` removes masking.

### Phase 4 — Custom install modal registry

- `apps/dashboard/src/components/connectors/install-modals/registry.ts`:
  ```ts
  import { GitHubAppInstallModal } from './github-app-install-modal';
  export const customInstallModalRegistry: Record<string, React.ComponentType<...>> = {
    'github-app': GitHubAppInstallModal,
  };
  ```
- `catalog-install-modal.tsx`: if entry has `customInstallComponent` and registry has it, render that. Else default behavior.

### Phase 5 — GitHub App connector

- Catalog entry `github-app`:
  ```json
  {
    "id": "github-app",
    "name": "GitHub App",
    "description": "Multi-installation access via a GitHub App. One connector per installation.",
    "icon": "github.svg",
    "docsUrl": "https://github.com/github/github-mcp-server",
    "transport": "stdio",
    "transportConfig": { "command": "github-mcp-server", "args": ["stdio"] },
    "customInstallComponent": "github-app",
    "authCheckTool": "get_me",
    "secrets": [],
    "tools": [],
    "tags": ["development", "code"]
  }
  ```
  - **Important**: `docsUrl` is a required field in `catalogEntrySchema` (`apps/api/src/lib/catalog-loader.ts:37`). Omitting it would fail Zod validation at catalog load.
  - **`secrets: []`**: the App flow's secrets are composite (`__GITHUB_APP_ID__`, `__GITHUB_APP_PEM__`, etc.) handled by the custom install component and the install endpoint, NOT by the standard secrets array. The empty array is valid per schema (`z.array(catalogSecretSchema)` accepts empty).
- Custom modal: app_id text input, PEM file picker (validates `BEGIN RSA PRIVATE KEY`), installations editor (add row → name + id + env_var).
- Submit button: POST to a new endpoint or to existing `POST /` with a discriminated `source: 'github-app'` payload.
- API handler: validates payload, signs a test JWT, mints test tokens for each installation (validation), then creates one connector row per installation with:
  - slug: `github-app-<installation.name kebab-cased lowercased>` (see Task 5.3 for exact rule).
  - **Five reserved-key secrets per row**: `__GITHUB_APP_ID__`, `__GITHUB_APP_PEM__`, `__GITHUB_INSTALLATION_ID__`, `__GITHUB_INSTALLATION_NAME__`, `__GITHUB_ENV_VAR__`. The worker (`mcp-build.ts`) recognizes these on each turn and synthesizes a fresh `GITHUB_PERSONAL_ACCESS_TOKEN` from the cached installation token before passing to `toStdioConfig`. The PEM and app credentials are NEVER forwarded to the github-mcp-server subprocess.
  - We do NOT store the minted `ghs_*` token in the DB — tokens are short-lived (1h); the worker mints fresh on every turn from the cached installation token (cache refreshed every 55 min by the existing interval).

### (Phase 5 includes the worker DB-sourcing changes — there is no separate Phase 6.)

The worker changes that consume DB-sourced app config land inside Phase 5:

- `app-auth.ts`:
  - Old: `loadGitHubAppConfig()` reads yaml; constructor takes `privateKeyPath` and reads the file via `fs.readFileSync`.
  - New: takes a `connectorRepo` arg, queries connectors where `slug LIKE 'github-app-%'`, reads the reserved keys from each connector's secrets, builds a `GitHubAppAuth` instance per app. Constructor accepts `privateKey: string` directly (PEM content from the DB), with a `privateKeyPath` fallback for back-compat during the transition.
  - Add a sync `getCachedToken(installationName: string): string | null` method that returns the cached token if still within the refresh margin, otherwise `null`. Used by `mcp-build.ts` to keep `buildMcpServersMap` synchronous.
  - JWT signing + interval refresh + cache code unchanged.
- `apps/worker/src/agent/mcp-build.ts`: in `buildMcpServersMap`, when `connector.slug.startsWith('github-app-')`, intercept BEFORE `toStdioConfig`. Mint a fresh installation token via the shared `GitHubAppAuth` instance, then synthesize a single `{key:'GITHUB_PERSONAL_ACCESS_TOKEN', value:<minted ghs_*>}` secret to pass to `toStdioConfig`. The four `__GITHUB_APP_*__` raw secrets are NEVER forwarded to the github-mcp-server subprocess.
- `apps/worker/src/index.ts`: pass `connectors` (the `ConnectorRepo`) to `loadGitHubAppConfig`. Cache the `GitHubAppAuth` instance for reuse by `mcp-build.ts`.
- For each `github-app-*` connector, also set the `env_var` (e.g., `<ORG>_GH_TOKEN`) at boot — same as today. This keeps `gh` CLI working.

### Phase 7 — Migration

- After Phase 5 work AND smoke verifies the App flow:
  1. `mkdir -p tmp/legacy-github-app/`
  2. Move `profiles/<your-profile>/skills/<owner>/github-app.pem` → `tmp/legacy-github-app/github-app.pem`
  3. Move `profiles/<your-profile>/skills/<owner>/github.md` → `tmp/legacy-github-app/github.md` (informational; the active SKILL.md stays in place).
  4. Edit `profiles/<your-profile>/config.yaml`: remove the entire `github_app:` block (lines 11-26 today).
  5. Edit `agent/config.yaml`: remove `github_app.app_id` and `github_app.private_key_file`. Move `github_app.git_identity` to a top-level `git_identity:` key (cleaner separation), and update `parseGitIdentityFromConfig` in `apps/worker/src/github/git-identity.ts` to read top-level first, falling back to `github_app.git_identity` for back-compat.
  6. Update `profile/<your-profile>/config.yaml`'s `approvals.always_sensitive` list to add per-installation merge entries (the policy supports only suffix wildcards; explicit list required).
  7. Add `tmp/legacy-github-app/README.md` documenting origin of each file + spec ID + date moved.
- Restart worker; verify `gh` CLI still works (env vars like `<ORG_A>_GH_TOKEN`, `<ORG_B>_GH_TOKEN`, etc. set from DB-sourced config).

### Phase 8 — `merge_pull_request` sensitive verification

- Smoke: with App flow installed, send "[smoke github-app] merge PR #X in <org>/<repo>" via Slack DM.
- Expected: agent asks for approval (always_sensitive policy fires) before calling `mcp__github-app-<org-slug>__merge_pull_request`.
- DB: `approvals_log` row with the approval request.

### Phase 9 — Quality gate, commit

- `pnpm -w run quality-gate` green throughout (run after each phase, or at minimum at the end).
- Commit on a feature branch (e.g., `feat/connector-github`); open a PR via `/open-pr`. Do NOT commit/push to main directly (CLAUDE.md global rule). This spec is large — multiple commits per phase (Personal → Schema/UI → App → Migration) is acceptable.

## Risks / Open Decisions

- **Decision: per-installation connector rows** (not one row with N installations).
- **Decision: app credentials stored in secrets** (`__GITHUB_APP_*` reserved keys) rather than a new table. Avoids schema migration.
- **Decision: minted token freshness** — done in worker, not at install time. Install-time mint only validates; runtime mints fresh.
- **Risk: PEM stored in DB** — same security model as other secrets (last4 reveal endpoint, audit log line). Acceptable; if user wants encrypt-at-rest, separate spec.
- **Open: pull installations from `/app/installations`** — future polish.
