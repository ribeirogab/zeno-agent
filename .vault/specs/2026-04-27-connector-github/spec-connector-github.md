---
status: shipped
feature: connector-github
created: 2026-04-27
shipped: 2026-04-27
---
# GitHub Connector — Spec

**Status:** Draft
**Scope:** Two catalog connectors for GitHub: **Personal** (one PAT) and **App** (multi-installation via app_id + private key + installations list). Both use the official `github/github-mcp-server` Go binary, installed at Docker build time. GitHub App also migrates the existing `config.yaml github_app:` block + `.pem` file to dashboard-managed configuration in the DB. Adds a per-connector custom-UI mechanism in the install modal for the App flow's PEM upload + installations editor.

## Brainstorm Q&A

### Why two catalog entries instead of one?

The App and Personal flows are different in three ways: setup complexity (App needs PEM + multiple installations; Personal needs one token), tool surface (both expose the same github-mcp-server tools, but with App the token's scope is per-installation), and runtime semantics (App tokens expire and refresh every hour; Personal tokens are static). Forcing both into one entry means the install modal has conditional fields and the runtime needs branching.

Two entries: clearer in the catalog UI ("install Personal if you just want to use your own GitHub account; install App for organization-scoped multi-repo access"), simpler install modals, simpler runtime. Both share the same github-mcp-server binary.

### Why the official `github/github-mcp-server` Go binary, not Docker?

Earlier research confirmed the official MCP from GitHub Inc. ships as a Docker image (`ghcr.io/github/github-mcp-server`) and a Go binary. Running Docker inside the Zeno container means Docker-in-Docker (mount socket or run dind) — both add infra surface and operational risk.

The Go binary path: `go install github.com/github/github-mcp-server/cmd/github-mcp-server@latest` in a build stage of the Dockerfile, copy the resulting binary into the runtime stage. The MCP runs as `github-mcp-server stdio` with the GITHUB_PERSONAL_ACCESS_TOKEN env var. No Docker daemon needed.

Trade-off: ~30MB extra in the image. Acceptable.

### App flow vs MCP

The MCP only accepts a PAT-shaped token (`GITHUB_PERSONAL_ACCESS_TOKEN`). It does NOT accept app credentials — App support is a long-open feature request on the official MCP repo.

Workaround: mint a **GitHub App installation token** (`ghs_…`) from the app's credentials and inject it as the PAT. Installation tokens are short-lived (1 hour) — Zeno's worker has to refresh before each turn (or cache with margin).

The existing `apps/worker/src/github/app-auth.ts` already does this exact JWT→installation-token exchange for the `gh` CLI use case. We reuse it: connector configured with App credentials → at runtime, before each spawn of github-mcp-server, mint a fresh installation token → pass as `GITHUB_PERSONAL_ACCESS_TOKEN`. The MCP doesn't know it's an installation token.

### Multi-installation: one connector per installation?

Yes. Each installation (one per org) is a separate scoped token. To query each via MCP, each gets its own connector instance pointing at github-mcp-server with a different runtime token.

Implementation shape: the catalog entry "GitHub App" is a **config holder** — the user installs it once, the dashboard custom UI captures app_id + PEM + the list of installations, and the install action **spawns one connector per installation** (slugs like `github-app-acmebooks`, `github-app-acme-shop`, etc). The user gets N-deep tool surface in `/connectors`, one per installation.

Alternative: one connector instance with a "current installation" runtime selector. Rejected — more complex routing in the worker, less visibility in the dashboard.

### Migrating the existing setup

Today: `profiles/<your-profile>/config.yaml` has the `github_app:` block; `profiles/<your-profile>/skills/<owner>/github-app.pem` is the key file; `apps/worker/src/github/app-auth.ts` reads both at boot.

After this spec:

1. The GitHub App connector entry is installed via dashboard with the PEM uploaded + installations list entered.
2. The DB has the data; `app-auth.ts` is updated to read from DB instead of config.yaml.
3. The yaml `github_app:` block + the `.pem` file move to `tmp/legacy-github-app/` for safekeeping (per user instruction).
4. The skill files referencing the per-org GH tokens keep working because the worker's `app-auth.ts` still mints those env vars at boot — just now sourced from DB.

### Custom UI per connector — how

Today the install modal renders generic input fields from `secrets[]`. For App, we need:

- **PEM file upload** (multi-line text, but file-picker is the right UX).
- **Multiple installations** — dynamic list of `{name, id, env_var}` triples.

Two approaches considered:

- **(a) Per-connector React component**, registered by id (`github-app` → `<GitHubAppInstallModal>`). Dashboard maintains a registry; catalog entry says `customInstallComponent: 'github-app'`.
- **(b) Extend `catalogSecretSchema` with `inputType: 'text' | 'password' | 'pem' | 'json-list'`**. Default modal renders per type. Catalog stays declarative.

(b) is leaner for simple cases; (a) is more flexible for complex composite UIs. **Decision: hybrid** — add `inputType` for primitives (`pem`, `password`, `text`) which extends the existing modal, AND allow `customInstallComponent` for full takeovers. App flow uses `customInstallComponent` because the installations array is a composite editor with add/remove rows that's awkward to express declaratively.

### Tool surface (PAT and App use the same MCP)

`github-mcp-server` exposes ~30 tools: issues, PRs, repos, code search, secrets, releases, workflows, etc. Categorization via `mcp-discover/classifyToolCategory` should land most correctly: `list_*`/`get_*`/`search_*` → read; `create_*`/`update_*`/`delete_*` → write. Things like `merge_pull_request` (already in `profile/config.yaml` `always_sensitive` list) need to remain sensitive even when called via MCP — verify the policy chain treats `mcp__github__merge_pull_request` (the connector tool name) the same way as the legacy free-form name.

### What about the rest of `gh` CLI usage?

`gh` is still in the container. The github_app bootstrap continues to mint `<ORG>_GH_TOKEN` env vars (sourced from DB after migration) so `gh` CLI works as before. The GitHub MCP and `gh` CLI coexist — both are valid paths for the agent. The agent will pick MCP when available (more structured), `gh` for things the MCP doesn't expose (some org-admin endpoints, custom queries).

### Auth check tools

- **GitHub Personal** MCP: cheapest no-args read tool is `get_me` (returns the authenticated user's profile).
- **GitHub App** MCP per installation: same `get_me` returns the bot identity for that installation. Confirms the minted token is valid.

`authCheckTool: 'get_me'` for both catalog entries.

## Context

Connectors infrastructure handles stdio with custom env (Sentry pattern) and remote with bearer (Linear pattern). GitHub Personal is just another stdio. GitHub App reuses the existing `app-auth.ts` token-minting machinery and connects it to the connector lifecycle.

The github_app config currently lives in profile yaml + a .pem file in the skills directory. User explicitly asked: "config deve ser feita somente pelo dashboard". This spec migrates that data to the DB.

## Problem Statement

Provide two catalog-installable GitHub connectors. The Personal flow is a one-tier install (paste PAT → done). The App flow handles app credentials + multi-installation, exposing one connector instance per installation. Existing yaml config + .pem file move to legacy folder; runtime reads from DB.

## Non-Goals

1. **OAuth App flow** (interactive browser consent). Deferred.
2. **GitHub App support inside the MCP** (changing github-mcp-server's auth code). Out of scope; we work around by minting installation tokens and feeding as PAT.
3. **Replacing `gh` CLI**. Both coexist.
4. **Org-wide github_app config across profiles**. Per-profile only — fits Zeno's single-tenant model.
5. **Auto-rotation of PATs.** Personal tokens are static; user is responsible for rotation.
6. **Re-architecting `apps/worker/src/github/app-auth.ts`**. Minimal change: source data from DB instead of yaml; keep the JWT signing + token caching unchanged.
7. **Dynamic installation discovery.** User enters the list manually. (Pulling installations from `GET /app/installations` would be nice but adds an API call at install time; tracked as polish.)

## Constraints

- **Two catalog entries**: `github` (Personal) and `github-app` (App).
- **Custom UI** for `github-app` install modal (PEM upload + installations editor). Personal uses the standard modal.
- **DB migration**: store app config (app_id, pem, installations) in `connector_secrets` of the app catalog entry — using JSON-string secrets for the composite installations field. New schema columns NOT required.
- **One connector instance per installation** — slug pattern `github-app-<installation-name-slug>` (e.g., `github-app-acmebooks`).
- **Reuse `app-auth.ts`** with minor changes: source from DB instead of yaml.
- **Go binary**: `go install github.com/github/github-mcp-server/cmd/github-mcp-server@v0.5.0` in a multi-stage Dockerfile build.
- **`authCheckTool: 'get_me'`** for both entries.
- **`merge_pull_request` and other write tools**: rely on the per-tool permission system. The existing `always_sensitive: [mcp__github__merge_pull_request]` in `profile/config.yaml` only catches the Personal connector — the App per-installation tools (`mcp__github-app-fnlivros__merge_pull_request`, etc.) need explicit entries because `makeAlwaysSensitivePolicy` only supports suffix wildcards (no middle-wildcard match). Phase 7.3 adds the App entries explicitly.
- **Migrate the existing yaml + .pem**: copy to `tmp/legacy-github-app/`, remove from profile, after the App connector is installed and verified.
- **Hard prerequisite: spec 0039's regenerator patch** (throw → warn+continue on missing env). Phase 2.2 (`--fetch-from-mcp`) requires it. Phase 1 includes a verification gate.
- **Execution context for Phase 2.2 (regenerator)**: runs on the host; host needs `github-mcp-server` on PATH. The bind-mount to the container is read-only and `apps/` is not mounted, same constraint as 0040/0041. Task 1.4 covers the host install.

## User Stories / Scenarios

### GitHub Personal flow

| ID | Surface | Description |
|---|---|---|
| GP1 | UI | Catalog card: "GitHub Personal" |
| GP2 | UI | Standard install modal — single field "Personal Access Token", help text links to github.com/settings/tokens |
| GP3 | API | `POST /catalog/github/test` bad token → `{ok: false, errorKind: 'auth'}` |
| GP4 | API | Real token → `{ok: true, tools: [<30+>]}` |
| GP5 | UI | Install completes; connector enabled |
| GP6 | RT | Slack DM: "[smoke github-personal] list open issues in repo your-github-username/zeno-agent" → agent uses MCP |

### GitHub App flow

| ID | Surface | Description |
|---|---|---|
| GA1 | UI | Catalog card: "GitHub App" |
| GA2 | UI | **Custom install modal**: text field for `app_id`, file upload for PEM, dynamic editor for installations (add row → name + id + env_var name) |
| GA3 | UI | Test → spawns one ephemeral test against installation #1, verifies the JWT signing + installation token mint flow + auth-check tool |
| GA4 | API | `POST /catalog/github-app/install` (new endpoint OR reuse `POST /` with extended payload) → creates **N connector rows** (one per installation), each with its own slug, secrets, and tools |
| GA5 | UI | After install, `/connectors` shows N entries (`github-app-acmebooks`, `github-app-acme-shop`, etc.) |
| GA6 | RT | Each per-installation connector spawns github-mcp-server with the minted ghs_* token. Token refresh happens automatically before each spawn (per spec 0033's per-turn MCP rebuild). |
| GA7 | Migration | After GA5 verified, the yaml `github_app:` block + `.pem` file move to `tmp/legacy-github-app/`. Worker boot's `app-auth.ts` reads from DB; existing skills/CLI still get the `<ORG>_GH_TOKEN` env vars. |
| GA8 | RT | Slack DM: "[smoke github-app] list open PRs in AcmeBooks/ecomm" → agent uses `mcp__github-app-acmebooks__list_pull_requests` |

### Coexistence

| ID | Surface | Description |
|---|---|---|
| GC1 | RT | After both connectors install, `gh` CLI keeps working (env vars still set by app-auth from DB). Agent picks MCP when available, falls back to `gh` for things MCP doesn't expose. |
| GC2 | Sensitive | `mcp__github__merge_pull_request` still hits the always_sensitive policy — sends the merge call to the human-in-the-loop approver before executing. Verify in smoke. |

## Success Criteria

- Both catalog entries committed.
- Go binary installed in image; `github-mcp-server --version` works in container.
- DB schema unchanged; app config stored as JSON-string secrets.
- Custom install modal for App flow renders + saves correctly.
- Per-installation connector creation works.
- Worker `app-auth.ts` reads from DB; yaml + .pem moved to `tmp/legacy-github-app/`.
- `gh` CLI still works.
- Manual smoke: GP3/GP4 + GA3/GA5 + GC2 all pass.
- Quality gate green (Phase A regression suite covers the basic flows; new tests for the custom-UI logic are nice-to-have but not blocking).
- Spec passes 3 review rounds.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Custom install modal coupling to the github-app catalog id | Register components in a small dashboard registry; if the id changes, registry re-points |
| PEM upload size + multi-line in browser | File picker → reads the file, validates PEM headers, sends as text in the install payload. Same as how secrets are sent today (just longer). |
| Installation token cache invalidation: connector edits → token cache stays stale | `connector_update` handler invalidates the in-memory `app-auth` cache for that connector |
| `go install` adds 200MB to build context (Go toolchain) | Multi-stage build: `golang` image as build stage; copy only the final binary into the runtime stage. Final image bumps ~30MB. |
| `github-mcp-server@latest` breaks API in a future version | Pin a specific version (e.g., `@v0.5.0`) in the Dockerfile install step. Bump deliberately. |
| Migration: yaml/.pem move corrupts existing app-auth bootstrap | Move only AFTER GA5 verifies the DB-sourced flow works. If anything fails, restore from `tmp/legacy-github-app/`. |
| `merge_pull_request` not classified as sensitive | Verify via SQL on `approvals_log` during smoke. Failure → patch the always_sensitive list |
| User loses PEM | Worker boot reads from DB only after migration; the .pem file in `tmp/` is a backup. If DB is wiped, user re-uploads. |

## Open Questions

- **(Resolved) Two entries vs one with conditional fields**: two entries.
- **(Resolved) Custom UI mechanism**: hybrid — declarative `inputType` for primitives + `customInstallComponent` registry for the App flow's composite editor.
- **(Resolved) Per-installation connectors**: yes, N rows. Slug pattern documented.
- **(Resolved) `app-auth.ts` minimal change**: yes, source from DB; reuse caching/signing.
- **(Open) Auto-discover installations from `/app/installations`**: future polish, not blocking. Tracked as a separate spec.

## Coverage gaps

- **Non-owner runtime path** for write tools (e.g., `merge_pull_request`): same gap as Linear. Single-tenant operator profile.
- **OAuth App flow**: deferred.
- **Multi-profile shared GitHub App**: not designed for. Each profile maintains its own.

## Findings during implementation

- **Finding #1: `golang:1.22` too old for github-mcp-server v0.5.0** (requires Go 1.23.7+). Bumped Dockerfile builder stage to `golang:1.24`.
- **Finding #2: Custom Install UI deferred**. The catalog entry uses `customInstallComponent: 'github-app'` but the spec's full custom React component (PEM file picker + installations editor) was deferred — install happens via the new API endpoint `POST /api/connectors/catalog/github-app/install`. The dashboard catalog modal will throw when opening github-app until the component is wired up; in practice, install is API-driven for v1. Tracked as a follow-up.
- **Finding #3: Worker doesn't hot-reload GitHubAppAuth**. After `connector_create` enqueues N github-app rows, the worker's already-bootstrapped `GitHubAppAuth` doesn't pick them up — the operator must restart the container so `loadGitHubAppConfig(connectors)` re-reads the DB. Documented in the install endpoint's API doc-comment. Hot-reload is a follow-up.
- **Finding #4: `mcp-build.ts` stays sync via `getCachedToken`**. As planned in spec round 3, added a synchronous `GitHubAppAuth.getCachedToken(installationName)` that returns the cached token if still valid, `null` otherwise. The interval-based `refreshAll` (55-min timer) keeps the cache fresh under the 60-min token TTL. Cache-miss path falls into the existing `connector_skipped` warning + last_error persist.
- **Finding #5: Reserved keys defense-in-depth**. Added the five `__GITHUB_*__` keys to `toStdioConfig`'s skip list so they're never forwarded to the github-mcp-server subprocess even on an accidental code path that bypasses `mcp-build.ts`'s intercept.
- **Finding #6: classifyError regex false positive**. Initial regex change for spec 0039 used `authenticat` as a fragment to catch "authentication". GitHub's `get_me` response contains `"two_factor_authentication":true` in success payloads — the regex matched, returning `errorKind: 'auth'` for valid responses. Tightened to `unauthenticat|authentication (failed|invalid|required|expired|denied|error)|authorization (expired|invalid|rejected|denied|failed|error)`. Verified against all 4 connectors (Linear/Klaviyo/Swarmia/GitHub) that bad-token still classifies as auth and good-token still classifies as ok.

## Review procedure

3 consecutive review rounds. R1 cold; R2 cross-check vs `apps/worker/src/github/app-auth.ts` + connector schema + dashboard install modal + Dockerfile patterns; R3 fresh.

## Implementation order

This spec is the largest of the four. Implementation phased:

1. **Phase 0**: Spec + 3 reviews.
2. **Phase 1 — Dockerfile + 0039 prereq gate**: verify 0039's regenerator patch present; add Go build stage to Dockerfile; copy `github-mcp-server` binary to runtime; install host binary for Phase 2.2.
3. **Phase 2 — GitHub Personal connector** (simple flow, builds confidence): catalog entry (no `inputType` yet — schema doesn't accept it until Phase 3), regenerator, icon, smoke. Slack DM in `D0EXAMPLE000`.
4. **Phase 3 — Catalog schema extension**: add optional `inputType` to `catalogSecretSchema` and `customInstallComponent` to `catalogEntrySchema`. Default modal renders per `inputType`. No breaking change.
5. **Phase 4 — Custom-component registry in dashboard**: register `github-app` install component (placeholder UI; iterate). Catalog entry references via `customInstallComponent: 'github-app'`.
6. **Phase 5 — GitHub App connector + DB-backed config**:
   - Custom install modal (PEM upload, installations editor).
   - Install endpoint creates N per-installation connector rows.
   - `app-auth.ts` reads from DB.
   - Smoke each installation. Slack DM in `D0EXAMPLE000`.
7. **Phase 7 — Migration**: copy yaml `github_app:` + `.pem` to `tmp/legacy-github-app/`; remove yaml block; update `always_sensitive` list with explicit per-installation entries; verify worker boot still works (DB sourcing + env vars + skills + `gh` CLI). (Note: there is no Phase 6 — Phase 5.4 already covers the worker DB-sourcing change.)
8. **Phase 8 — `merge_pull_request` sensitive verification**: smoke that `mcp__github-app-<inst>__merge_pull_request` triggers the always_sensitive approver.
9. **Phase 9 — Close**: spec status `shipped`; commit on a feature branch + open PR (per CLAUDE.md, no direct commits to main). Wait for explicit user authorization to push and merge.

Estimated effort: 2-3 days (custom UI + DB sourcing migration are the big chunks).
